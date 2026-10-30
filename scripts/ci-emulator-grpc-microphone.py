#!/usr/bin/env python3
"""Inject real PCM samples through Android emulator's gRPC microphone, not host PulseAudio.

Test-only; feeds a deterministic 440 Hz sine tone. No Android permissions,
production code, or user phone is modified. The existing WebView instrumented
test still must prove real getUserMedia + MediaRecorder bytes.
"""
import configparser
import getpass
import math
import os
import struct
import subprocess
import sys
import time
from pathlib import Path

import grpc

PORT = 8554
SAMPLE_RATE = 24000
FRAME_MS = 20
STREAM_SECONDS = 210
RPC = "/android.emulation.control.EmulatorController/injectAudio"


def varint(number: int) -> bytes:
    result = bytearray()
    while number > 127:
        result.append((number & 127) | 128)
        number >>= 7
    result.append(number)
    return bytes(result)


def field(number: int, value: int) -> bytes:
    return varint((number << 3) | 0) + varint(value)


def bytes_field(number: int, value: bytes) -> bytes:
    return varint((number << 3) | 2) + varint(len(value)) + value


def discover_token():
    user = getpass.getuser()
    roots = [
        Path(os.environ.get("XDG_RUNTIME_DIR", f"/tmp/android-{user}")) / "avd" / "running",
        Path(f"/tmp/android-{user}") / "avd" / "running",
        Path.home() / ".android" / "avd" / "running",
    ]
    for root in roots:
        for candidate in sorted(root.glob("pid_*.ini"), reverse=True):
            config = configparser.ConfigParser()
            try:
                config.read_string("[emulator]\n" + candidate.read_text())
                section = config["emulator"]
                if int(section.get("grpc.port", "0")) == PORT:
                    return section.get("grpc.token", "")
            except (OSError, ValueError, configparser.Error):
                continue
    return None


def pcm_audio():
    samples_per_frame = SAMPLE_RATE * FRAME_MS // 1000
    fmt = field(1, SAMPLE_RATE) + field(2, 0) + field(3, 1) + field(4, 0)
    total_frames = STREAM_SECONDS * 1000 // FRAME_MS
    for frame in range(total_frames):
        audio = bytearray()
        for pos in range(samples_per_frame):
            idx = frame * samples_per_frame + pos
            value = int(9000 * math.sin(2 * math.pi * 440 * idx / SAMPLE_RATE))
            audio.extend(struct.pack("<h", value))
        packet = (bytes_field(1, fmt) if frame == 0 else b"") + bytes_field(3, bytes(audio))
        yield packet


def wait_for_real_capture():
    # Do not inject during Android boot or while installing the APK: emulator
    # 37 has a native audio-injection startup race. Wait for instrumentation.
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        try:
            result = subprocess.run(
                ["adb", "logcat", "-d", "-s", "LooplyMicCapture:I"],
                capture_output=True, text=True, timeout=8, check=False,
            )
            if "LOOPLY_CAPTURE_READY" in result.stdout:
                return True
        except (OSError, subprocess.TimeoutExpired):
            pass
        time.sleep(0.6)
    return False


def main():
    if not wait_for_real_capture():
        print("Looply: the real WebView microphone test did not signal readiness", flush=True)
        return 1
    token = None
    for attempt in range(30):
        token = discover_token()
        if token is not None:
            break
        time.sleep(0.5)
    if token is None:
        print("Looply: Android emulator gRPC discovery file was not found", flush=True)
        return 1
    metadata = (("authorization", "Bearer " + token),) if token else None
    print("Looply emulator virtual microphone gRPC injection starting", flush=True)
    channel = grpc.insecure_channel(f"127.0.0.1:{PORT}")
    client = channel.stream_unary(RPC, request_serializer=lambda x: x, response_deserializer=lambda x: x)
    try:
        client(pcm_audio(), metadata=metadata, timeout=STREAM_SECONDS + 60)
        print("Looply emulator virtual microphone injection completed", flush=True)
        return 0
    except grpc.RpcError as error:
        print("Looply emulator microphone gRPC failed: " + str(error.code()), flush=True)
        return 1
    finally:
        channel.close()


if __name__ == "__main__":
    sys.exit(main())
