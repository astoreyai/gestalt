/**
 * Density vertex shader for point cloud density visualization.
 * Passes position through with configurable point size based on
 * density or camera distance.
 */

uniform float uPointSize;
uniform float uDensityScale;
uniform float uMinSize;
uniform float uMaxSize;

attribute float density;

varying float vDensity;
varying vec3 vPosition;

void main() {
    vDensity = density;
    vPosition = position;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Point size: combine base size with density, attenuate by distance
    float distanceAttenuation = 300.0 / (-mvPosition.z);
    float densitySize = mix(uMinSize, uMaxSize, density * uDensityScale);
    gl_PointSize = densitySize * distanceAttenuation * uPointSize;

    // Clamp to reasonable range
    gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);

    gl_Position = projectionMatrix * mvPosition;
}
