import * as THREE from 'three';

// Character colors have a fixed neutral light and compensate for the stage's
// display transform. Pink spotlights never change the photograph's palette.
export function characterMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: { uComposer: { value: 1 }, uExposure: { value: 1.25 }, uTime: { value: 0 }, uReveal: { value: 0 }, uShield: { value: 0 } },
    vertexShader: `
      varying vec3 vPaint;
      varying vec3 vFaceNormal;
      varying vec3 vLocal;
      void main() {
        vPaint = color.rgb;
        vFaceNormal = normalize(normalMatrix * normal);
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPaint;
      varying vec3 vFaceNormal;
      varying vec3 vLocal;
      uniform float uComposer;
      uniform float uExposure;
      uniform float uTime,uReveal,uShield;
      vec3 reverseDisplay(vec3 target) {
        mat3 invOutput = mat3(
          .64303825,.05926869,.00596190,
          .31118675,.93143649,.06392902,
          .04577546,.00929492,.93011838
        );
        mat3 invInput = mat3(
          1.76474097,-.14702785,-.03633683,
          -.67577768,1.16025151,-.16243644,
          -.08896329,-.01322366,1.19877327
        );
        vec3 y = clamp(invOutput * target, vec3(.0001), vec3(.995));
        vec3 a = .983729 * y - 1.0;
        vec3 b = .4329510 * y - .0245786;
        vec3 c = .238081 * y + .000090537;
        vec3 x = (-b - sqrt(max(b*b - 4.0*a*c,vec3(0.0)))) / (2.0*a);
        return invInput * x * (.6 / uExposure);
      }
      void main() {
        vec3 n = normalize(vFaceNormal);
        vec3 key = normalize(vec3(-.48,.65,1.0));
        float diffuse = max(0.0,dot(n,key));
        float shade = .46 + .54 * pow(diffuse,.8);
        vec3 displayColor = vPaint * shade;
        float edge = pow(1.-abs(n.z),3.);
        float scan = exp(-pow((vLocal.y-(1.-uReveal)*4.)*12.,2.))*step(.01,uReveal);
        displayColor = mix(displayColor,vec3(.16,.8,.95),clamp(scan*.8+edge*uShield,0.,.85));
        if (uComposer > .5) {
          gl_FragColor = vec4(reverseDisplay(displayColor),1.0);
        } else {
          gl_FragColor = vec4(displayColor,1.0);
          #include <colorspace_fragment>
        }
      }
    `,
    toneMapped: false,
  });
}
