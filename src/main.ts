import * as THREE from 'three';

import { VRButton, TextGeometry, FontLoader } from 'three/examples/jsm/Addons';

import SourceCodeProRegular from '../fonts/source_code_pro_regular.typeface.json'

let FONT = new FontLoader().parse(SourceCodeProRegular);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);



async function main() {
    let RADIUS = 5;

    document.body.appendChild(VRButton.createButton(renderer));
    renderer.xr.enabled = true;

    let tick_marks: Array<THREE.Line> = [];

    var red_mark: THREE.Line | undefined;
    var red_mark_rad = 0 / 180 * Math.PI;


    // 刻度线
    for (var i = 0; i < 72; i++) {
        let rad = i * 5 / 180 * Math.PI;
        let x = RADIUS * Math.cos(rad);
        let y = RADIUS * Math.sin(rad);

        const points: Array<THREE.Vector3> = [];
        points.push(new THREE.Vector3(x, -2, y));
        points.push(new THREE.Vector3(x, +2, y));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: new THREE.Color(0, 1, 1).lerpHSL(new THREE.Color(1, 1, 0), i / 72.0) });

        let line = new THREE.Line(geometry, material);
        scene.add(line);
        tick_marks.push(line);
    }

    // 标记线
    {
        const points: Array<THREE.Vector3> = [];
        points.push(new THREE.Vector3(0, -2, RADIUS * 0.8));
        points.push(new THREE.Vector3(0, +2, RADIUS * 0.8));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        let line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
        scene.add(line);
        
        let fixed_line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }));
        scene.add(fixed_line);
        tick_marks.push(fixed_line);

        red_mark = line;
    }

    var current_text: THREE.Mesh | undefined = undefined;

    var triggered = false;
    var measuring_mode = false;
    var measured_result: number | null = null;
    var fixed_rad = 0;
    var text_geometries: Array<TextGeometry> = []
    var text_material = new THREE.MeshBasicMaterial({ color: 0x0000ff });

    for(var i = 0; i < 360; i++) {
        let geometry = new TextGeometry(`${(i).toFixed(0)}`, {
            font: FONT,
            size: 0.2,
            height: 0.05,
        });
        text_geometries.push(geometry);
    }

    function on_triggerred() {
        triggered = true;
    }

    try {
        for (var i = 0; i < 2; i++) {
            let controller = renderer.xr.getController(i);
            controller.addEventListener("selectstart", on_triggerred);
            scene.add(controller);
        }
    } catch (e) { }

    renderer.setAnimationLoop(function () {

        let cameras = renderer.xr.getCamera().cameras;
        if (cameras.length == 2) {

            let trans1 = new THREE.Vector3();
            let trans2 = new THREE.Vector3();

            let rot1 = new THREE.Quaternion();
            let rot2 = new THREE.Quaternion();

            let _scale = new THREE.Vector3();

            cameras[0].matrixWorld.decompose(trans1, rot1, _scale);
            cameras[1].matrixWorld.decompose(trans2, rot2, _scale);

            let camera_position = new THREE.Vector3();
            camera_position.copy(trans1);
            camera_position.add(trans2).divideScalar(2);

            let rotation_matrix = new THREE.Matrix4();
            rotation_matrix.makeRotationX(Math.PI / 2);

            let camera_rotation = rot1.slerp(rot2, 0.5);
            let camera_rotation_matrix = new THREE.Matrix4();
            camera_rotation_matrix.makeRotationFromQuaternion(camera_rotation);

            let forward_direction = new THREE.Vector3(-1, 0, 0);
            forward_direction.applyQuaternion(camera_rotation);

            let horizontal_radius = Math.atan2(forward_direction.z, forward_direction.x);
            if (horizontal_radius < 0) horizontal_radius += 2 * Math.PI;

            {
                let horizontal_rotation_matrix = new THREE.Matrix4();
                horizontal_rotation_matrix.makeRotationY(horizontal_radius);

                // 刻度线跟随相机 & 旋转
                let mark_transform = new THREE.Matrix4();
                mark_transform.copy(camera_rotation_matrix);
                mark_transform.multiply(horizontal_rotation_matrix);
                mark_transform.setPosition(camera_position.x, camera_position.y, camera_position.z);

                for (let mark of tick_marks) {
                    mark.matrix.copy(mark_transform);
                    mark.matrixAutoUpdate = false;
                }
            }

            var measuring_mode_end = false;

            {
                let horizontal_rotation_matrix = new THREE.Matrix4();

                if(triggered) {
                    measuring_mode = !measuring_mode
                    
                    if(measuring_mode) {
                        fixed_rad = horizontal_radius;
                    } else {
                        measuring_mode_end = true;
                    }
                }
                
                if(measuring_mode) {
                    horizontal_rotation_matrix.makeRotationY(fixed_rad + red_mark_rad);
                } else {
                    horizontal_rotation_matrix.makeRotationY(horizontal_radius + red_mark_rad);
                }

                // 刻度线跟随相机 & 旋转
                let mark_transform = new THREE.Matrix4();
                mark_transform.copy(camera_rotation_matrix);
                mark_transform.multiply(horizontal_rotation_matrix);
                mark_transform.setPosition(camera_position.x, camera_position.y, camera_position.z);

                let red_mark_nonnull = red_mark as THREE.Line;
                red_mark_nonnull.matrix.copy(mark_transform);
                red_mark_nonnull.matrixAutoUpdate = false;
            }

            triggered = false;

            {
                var rad = horizontal_radius;
                if(measuring_mode || measuring_mode_end) {
                    rad = Math.abs(horizontal_radius - fixed_rad);
                    if(rad > Math.PI) {
                        rad = 2 * Math.PI - rad;
                    }
                    if(measuring_mode_end) {
                        measured_result = rad;
                    }
                } else {
                    if(measured_result != null) {
                        rad = measured_result;
                    }
                }
                let text = new THREE.Mesh(text_geometries[Math.round(rad / Math.PI * 180)], text_material);

                let pre_matrix1 = new THREE.Matrix4();
                pre_matrix1.setPosition(0, 0, -RADIUS * 0.8);

                let post_matrix = new THREE.Matrix4();
                post_matrix.setPosition(camera_position.x, camera_position.y, camera_position.z);

                let text_transform = new THREE.Matrix4();
                text_transform.copy(post_matrix);
                text_transform.multiply(camera_rotation_matrix);
                text_transform.multiply(pre_matrix1);
                text.applyMatrix4(text_transform);

                // 后 - 前

                scene.add(text);

                if (current_text != null) {
                    scene.remove(current_text);
                }

                current_text = text;
            }
        }

        renderer.render(scene, camera);
    });
}

main();
