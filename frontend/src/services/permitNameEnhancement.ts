export function enhancePermitNamePixels(
  pixels: Uint8ClampedArray,
  contrast = 1.25,
) {
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114
    const adjusted = Math.max(
      0,
      Math.min(255, (luminance - 128) * contrast + 128),
    )
    pixels[index] = adjusted
    pixels[index + 1] = adjusted
    pixels[index + 2] = adjusted
  }
  return pixels
}
