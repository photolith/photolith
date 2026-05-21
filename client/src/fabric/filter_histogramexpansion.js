import { filters, classRegistry } from 'fabric';

export class HistogramExpansion extends filters.BaseFilter {
  // GLSL fragment shader: looks up each input channel in the equalisation LUT
  // (a 256x1 LUMINANCE texture bound to unit 1) and mixes between the source
  // and the LUT-mapped value by uIntensity. The LUT encodes both the active
  // range — bins outside the populated histogram clamp to 0 / 1 — and the
  // non-linear redistribution inside it, so the shader needs nothing else.
  static fragmentSource = 'precision highp float;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform sampler2D uLut;\n' +
    'uniform float uIntensity;\n' +
    'varying vec2 vTexCoord;\n' +
    'void main() {\n' +
      'vec4 color = texture2D(uTexture, vTexCoord);\n' +
      'vec3 mapped = vec3(\n' +
        'texture2D(uLut, vec2(color.r, 0.5)).r,\n' +
        'texture2D(uLut, vec2(color.g, 0.5)).r,\n' +
        'texture2D(uLut, vec2(color.b, 0.5)).r\n' +
      ');\n' +
      'color.rgb = mix(color.rgb, mapped, uIntensity);\n' +
      'gl_FragColor = color;\n' +
    '}';

  static defaults = {
    // Strength of the equalisation, 0 (no-op) to 1 (fully equalised).
    histogramExpansion: 0,
    // 256-bin Uint32Array describing the intensity distribution of the region
    // to equalise against. Bins outside the populated range get clamped to
    // 0 / 1 by the LUT; null disables the filter.
    histogram: null
  };

  static type = 'HistogramExpansion';

  getFragmentSource () {
    return HistogramExpansion.fragmentSource;
  }

  // Lets fabric skip applying the filter entirely when it would have no effect.
  isNeutralState () {
    return this.histogramExpansion === 0 || !this.histogram;
  }

  // Build a 256-entry Uint8 LUT from the histogram using the standard
  // histogram-equalisation formula
  //   equalised(i) = clamp((CDF(i) - CDF_min) / (1 - CDF_min), 0, 1)
  // where CDF_min is the first non-zero CDF value. This pins the lowest
  // populated bin to 0 and the highest to 1, with the curve in between
  // determined by the local density of intensities.
  _buildLut () {
    const lut = new Uint8Array(256);
    if (!this.histogram) return lut;
    let total = 0;
    for (let i = 0; i < 256; i++) total += this.histogram[i];
    if (!total) return lut;

    let cumulative = 0;
    let cdfMin = 0;
    for (let i = 0; i < 256; i++) {
      cumulative += this.histogram[i];
      if (cdfMin === 0 && cumulative > 0) cdfMin = cumulative / total;
      const cdf = cumulative / total;
      const denom = 1 - cdfMin;
      const v = denom > 0 ? (cdf - cdfMin) / denom : 0;
      lut[i] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
    return lut;
  }

  // CPU fallback used when WebGL is unavailable; mirrors the fragment shader,
  // building the same LUT and mixing each channel toward its mapped value.
  applyTo2d (options) {
    if (this.histogramExpansion === 0 || !this.histogram) return;
    const data = options.imageData.data;
    const len = data.length;
    const intensity = this.histogramExpansion;
    const lut = this._buildLut();
    for (let i = 0; i < len; i += 4) {
      for (let j = 0; j < 3; j++) {
        const src = data[i + j];
        data[i + j] = src + (lut[src] - src) * intensity;
      }
    }
  }

  // Override the WebGL apply so we can upload the equalisation LUT as a
  // 256x1 LUMINANCE texture on unit 1 before letting the base class run the
  // shader. The texture is created and destroyed inline — filter instances
  // are short-lived (rebuilt on each filter change) so caching adds no value.
  applyToWebGL (options) {
    const gl = options.context;
    const lutBytes = this._buildLut();
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, lutBytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
      uIntensity: gl.getUniformLocation(program, 'uIntensity'),
      uLut: gl.getUniformLocation(program, 'uLut')
    };
  }

  // Pushes the current JS-side parameter values into the shader's uniforms
  // before each draw. uLut samples from texture unit 1, bound in applyToWebGL.
  sendUniformData (gl, uniformLocations) {
    gl.uniform1f(uniformLocations.uIntensity, this.histogramExpansion);
    gl.uniform1i(uniformLocations.uLut, 1);
  }
}

classRegistry.setClass(HistogramExpansion);
