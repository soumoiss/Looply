// Shared, testable Story soundtrack mixer. The input must be owned or licensed
// for synchronization; commercial catalogue previews never reach this module.
export function hasAudibleStorySamples(buffer, threshold=0.0005) {
  if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 ||
      !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1) return false;
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const pcm = buffer.getChannelData(channel);
    const step = Math.max(1, Math.floor(pcm.length / 12000));
    for (let i = 0; i < pcm.length; i += step) {
      const value = pcm[i];
      if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
    }
  }
  return peak >= threshold;
}

export function attachStoryMusic(context, destination, buffer) {
  if (!hasAudibleStorySamples(buffer))
    throw new Error("Este áudio está silencioso. Escolha outra música.");
  const source=context.createBufferSource();
  source.buffer=buffer;
  source.loop=true;
  source.connect(destination);
  return source;
}
