export function createCallRingtone({ onBlocked = () => {} } = {}) {
  let context = null;
  let timer = null;

  const pulse = () => {
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);
  };

  const start = async () => {
    if (timer) return true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    context ||= new AudioContext();
    try {
      await context.resume();
    } catch {
      onBlocked();
      return false;
    }
    pulse();
    timer = window.setInterval(pulse, 1800);
    if (navigator.vibrate) navigator.vibrate([160, 100, 160]);
    return true;
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = null;
    if (navigator.vibrate) navigator.vibrate(0);
    if (context?.state === "running") void context.suspend();
  };

  return { start, stop };
}
