import { filters, classRegistry } from 'fabric';

export class ThresholdImage extends filters.BaseFilter {
  // GLSL fragment shader: ignore the source image entirely and sample the
  // supplied threshold mask (a LUMINANCE texture of 0/255 bytes on unit 1).
  // The mask spans 0..1 in vTexCoord, so non-matching aspect ratios stretch
  // the same way fabric stretches the source texture.
  static fragmentSource = 'precision highp float;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform sampler2D uThreshold;\n' +
    'varying vec2 vTexCoord;\n' +
    'void main() {\n' +
      'float v = texture2D(uThreshold, vTexCoord).r;\n' +
      'gl_FragColor = vec4(v, v, v, 1.0);\n' +
    '}';

  static defaults = {
    // Uint8ClampedArray returned by `thresholdLocalOtsu` (carrying phWidth /
    // phHeight). Bit 0 of each byte is the threshold result; the upper 7 bits
    // are ignored here. null disables the filter.
    image: null
  };

  static type = 'ThresholdImage';

  getFragmentSource () {
    return ThresholdImage.fragmentSource;
  }

  // Lets fabric skip applying the filter entirely when no mask is supplied.
  isNeutralState () {
    return !this.image;
  }

  // Extract bit 0 of every byte into a fresh Uint8Array of 0 / 255 so the
  // shader (and 2D fallback) can use it directly without bit twiddling.
  _buildMask () {
    const src = this.image;
    const out = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i += 1) out[i] = (src[i] & 1) * 255;
    return out;
  }

  // CPU fallback used when WebGL is unavailable. Nearest-neighbour-map each
  // output pixel back into the (typically lower-resolution) threshold image
  // and write pure black or white.
  applyTo2d (options) {
    if (!this.image) return;
    const data = options.imageData.data;
    const { width, height } = options.imageData;
    const src = this.image;
    const sw = src.phWidth;
    const sh = src.phHeight;
    for (let y = 0; y < height; y += 1) {
      const sy = Math.min(sh - 1, Math.floor(y * sh / height));
      const srcRow = sy * sw;
      for (let x = 0; x < width; x += 1) {
        const sx = Math.min(sw - 1, Math.floor(x * sw / width));
        const v = (src[srcRow + sx] & 1) * 255;
        const j = (y * width + x) * 4;
        data[j] = v;
        data[j + 1] = v;
        data[j + 2] = v;
      }
    }
  }

  // Override the WebGL apply so we can upload the threshold mask as a
  // phWidth × phHeight LUMINANCE texture on unit 1 before letting the base
  // class run the shader. The texture is created and destroyed inline —
  // filter instances are short-lived, so caching adds no value.
  applyToWebGL (options) {
    const gl = options.context;
    const mask = this._buildMask();
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // phWidth may not be a multiple of 4, so relax the default row alignment
    // before uploading single-channel data.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, this.image.phWidth, this.image.phHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bindAdditionalTexture(gl, texture, gl.TEXTURE1);
    super.applyToWebGL(options);
    this.unbindAdditionalTexture(gl, gl.TEXTURE1);
    gl.deleteTexture(texture);
  }

  // Resolves the shader's uniform handles once the program is compiled, so
  // sendUniformData can push values each frame without re-querying them.
  getUniformLocations (gl, program) {
    return {
      uThreshold: gl.getUniformLocation(program, 'uThreshold')
    };
  }

  // Pushes the current JS-side parameter values into the shader's uniforms
  // before each draw. uThreshold samples from texture unit 1, bound in
  // applyToWebGL.
  sendUniformData (gl, uniformLocations) {
    gl.uniform1i(uniformLocations.uThreshold, 1);
  }
}

classRegistry.setClass(ThresholdImage);
