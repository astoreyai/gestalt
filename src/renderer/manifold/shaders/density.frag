/**
 * Density fragment shader for kernel density visualization.
 * Maps density values to a viridis-like color ramp and applies
 * Gaussian falloff within each point sprite for smooth blending.
 */

precision highp float;

varying float vDensity;
varying vec3 vPosition;

uniform float uOpacity;
uniform float uKernelBandwidth;

/**
 * Viridis-like color map approximation.
 * Maps t in [0, 1] to an RGB color.
 */
vec3 viridis(float t) {
    t = clamp(t, 0.0, 1.0);

    // Polynomial approximation of the viridis colormap
    vec3 c0 = vec3(0.2777, 0.0054, 0.3340);
    vec3 c1 = vec3(0.1050, 0.5631, 0.7255);
    vec3 c2 = vec3(-0.3308, 1.0156, -1.2350);
    vec3 c3 = vec3(6.2280, -3.8274, 0.1400);
    vec3 c4 = vec3(-11.607, 7.1497, 1.2526);
    vec3 c5 = vec3(10.030, -5.3917, -1.0200);
    vec3 c6 = vec3(-3.6580, 1.7052, 0.3690);

    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

/**
 * Gaussian kernel for smooth point rendering.
 * Creates a smooth circular falloff from center.
 */
float gaussianKernel(vec2 uv, float bandwidth) {
    float r2 = dot(uv, uv);
    // Discard outside the unit circle
    if (r2 > 1.0) discard;
    return exp(-r2 / (2.0 * bandwidth * bandwidth));
}

void main() {
    // gl_PointCoord gives [0,1] within the point sprite
    vec2 uv = gl_PointCoord * 2.0 - 1.0;

    // Apply Gaussian kernel for soft circular points
    float kernel = gaussianKernel(uv, uKernelBandwidth);

    // Map density to color using viridis
    vec3 color = viridis(vDensity);

    // Final alpha combines kernel shape, density, and global opacity
    float alpha = kernel * (0.3 + 0.7 * vDensity) * uOpacity;

    gl_FragColor = vec4(color, alpha);
}
