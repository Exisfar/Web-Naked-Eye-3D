// Import DeviceDetector
import DeviceDetector from "https://cdn.skypack.dev/device-detector-js@2.2.10";

// Test browser support
testSupport([{ client: "Chrome" }]);
function testSupport(supportedDevices) {
  const deviceDetector = new DeviceDetector();
  const detectedDevice = deviceDetector.parse(navigator.userAgent);
  let isSupported = false;
  for (const device of supportedDevices) {
    if (device.client !== undefined) {
      const re = new RegExp(`^${device.client}$`);
      if (!re.test(detectedDevice.client.name)) {
        continue;
      }
    }
    if (device.os !== undefined) {
      const re = new RegExp(`^${device.os}$`);
      if (!re.test(detectedDevice.os.name)) {
        continue;
      }
    }
    isSupported = true;
    break;
  }
  if (!isSupported) {
    alert(`This demo, running on ${detectedDevice.client.name}/${detectedDevice.os.name}, ` +
      `is not well supported at this time, continue at your own risk.`);
  }
}

// Three.js variables
let scene, camera, renderer;
let eyePosition = { x: 0, y: 0 };
let smoothedEyePosition = { x: 0, y: 0 };
let eyeDistance = 60; // Default distance in cm
let disks = []; // Array to store all disk objects
let staticDisks = []; // Array to store static disks
let movingDisks = []; // Array to store moving disks
let hasDetectedEye = false; // Flag to track if eye has been detected
let hasStartedMoving = false; // Flag to track if disks have started moving

// Constants for smoothing
const SMOOTHING_FACTOR = 0.3; // Lower = smoother but more lag
const MOVEMENT_THRESHOLD = 0.02; // Minimum movement required to update position

// Initialize Three.js scene
function initThreeJS() {
  const canvas = document.getElementById('threejs-canvas');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Custom camera setup will be done in updateCamera()
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = -6;

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Create static disks at a distance
  for (let i = 0; i < 8; i++) {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 32);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(Math.random(), Math.random(), Math.random()),
      side: THREE.DoubleSide
    });
    const disk = new THREE.Mesh(geometry, material);

    // Position at a fixed distance with more even distribution
    const radius = 3; // Reduced from 4 to 3
    // Use golden ratio for more even distribution
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const theta = i * 2 * Math.PI / goldenRatio;
    const phi = Math.acos(1 - 2 * (i + 0.5) / 8);

    disk.position.x = radius * Math.sin(phi) * Math.cos(theta);
    disk.position.y = radius * Math.sin(phi) * Math.sin(theta);
    disk.position.z = radius * Math.cos(phi);

    // Random rotation
    disk.rotation.x = Math.random() * Math.PI;
    disk.rotation.y = Math.random() * Math.PI;

    scene.add(disk);
    staticDisks.push(disk);
  }

  // Create moving disks that will come towards viewer and stop
  for (let i = 0; i < 5; i++) {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 32);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(Math.random(), Math.random(), Math.random()),
      side: THREE.DoubleSide
    });
    const disk = new THREE.Mesh(geometry, material);

    // Start from closer distance with more even distribution
    const radius = 4; // Reduced from 6 to 4
    // Use golden ratio for more even distribution
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const theta = i * 2 * Math.PI / goldenRatio;
    const phi = Math.acos(1 - 2 * (i + 0.5) / 5);

    disk.position.x = radius * Math.sin(phi) * Math.cos(theta);
    disk.position.y = radius * Math.sin(phi) * Math.sin(theta);
    disk.position.z = radius * Math.cos(phi);

    // Random rotation
    disk.rotation.x = Math.random() * Math.PI;
    disk.rotation.y = Math.random() * Math.PI;

    // Add movement properties
    disk.userData = {
      speed: 0.05 + Math.random() * 0.1,
      direction: new THREE.Vector3(
        -disk.position.x,
        -disk.position.y,
        -disk.position.z
      ).normalize(),
      hasStopped: false,
      startTime: i * 2000 // Stagger start times by 2 seconds each
    };

    scene.add(disk);
    movingDisks.push(disk);
  }

  // Add some reference points
  const gridHelper = new THREE.GridHelper(8, 8);
  gridHelper.position.y = -2; // Move grid down to be at eye level
  scene.add(gridHelper);

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Update Three.js camera based on eye position
function updateCamera() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Convert eye position from screen coordinates to normalized device coordinates (-1 to 1)
  const ndcX = (eyePosition.x / width) * 2 - 1;
  const ndcY = -((eyePosition.y / height) * 2 - 1);

  // Apply smoothing to eye position
  const targetX = ndcX;
  const targetY = ndcY;

  // Only update if movement is significant
  if (Math.abs(targetX - smoothedEyePosition.x) > MOVEMENT_THRESHOLD ||
      Math.abs(targetY - smoothedEyePosition.y) > MOVEMENT_THRESHOLD) {
    smoothedEyePosition.x += (targetX - smoothedEyePosition.x) * SMOOTHING_FACTOR;
    smoothedEyePosition.y += (targetY - smoothedEyePosition.y) * SMOOTHING_FACTOR;
  }

  // Calculate distance-based scaling with reduced effect
  const distanceScale = Math.max(0.8, Math.min(1.2, 1 + (eyeDistance - 60) / 200)); // Reduced scaling range

  // Calculate the screen dimensions in world space
  const screenWidth = 2 * Math.tan(THREE.MathUtils.degToRad(75) / 2) * Math.abs(camera.position.z);
  const screenHeight = screenWidth * (height / width);

  // Calculate the eye position in world space with initial centering
  const eyeX = (smoothedEyePosition.x * (screenWidth / 2)) * distanceScale;
  const eyeY = (smoothedEyePosition.y * (screenHeight / 2) - 2) * distanceScale;
  const eyeZ = -6 * distanceScale;

  // Calculate the frustum parameters
  const near = 0.1;
  const far = 1000;
  const fov = 75;
  const aspect = width / height;

  // Calculate the frustum boundaries
  const top = near * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const bottom = -top;
  const right = top * aspect;
  const left = -right;

  // Calculate the off-axis frustum with correct perspective direction
  const offsetX = (eyeX / Math.abs(eyeZ)) * near * 0.5;
  const offsetY = (eyeY / Math.abs(eyeZ)) * near * 0.5;

  // Create the off-axis projection matrix
  const projectionMatrix = new THREE.Matrix4().makePerspective(
    left + offsetX,
    right + offsetX,
    bottom + offsetY,
    top + offsetY,
    near,
    far
  );

  // Update camera with smooth position transition
  camera.projectionMatrix = projectionMatrix;
  camera.position.set(eyeX, eyeY, eyeZ);
  camera.lookAt(0, -2, 0);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const currentTime = Date.now();

  // Update moving disks only after eye detection and only once
  if (hasDetectedEye && !hasStartedMoving) {
    hasStartedMoving = true;
    movingDisks.forEach(disk => {
      disk.userData.startTime = currentTime + disk.userData.startTime;
    });
  }

  if (hasStartedMoving) {
    movingDisks.forEach(disk => {
      if (!disk.userData.hasStopped && currentTime > disk.userData.startTime) {
        // Move disk towards viewer
        disk.position.add(disk.userData.direction.multiplyScalar(disk.userData.speed));

        // Stop if close enough to viewer
        if (disk.position.length() < 2) {
          disk.userData.hasStopped = true;
        }
      }
    });
  }

  updateCamera();
  renderer.render(scene, camera);
}

// MediaPipe setup
const controls = window;
const drawingUtils = window;
const mpFaceMesh = window;

const config = {
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
};

// Our input frames will come from here.
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const controlsElement = document.getElementsByClassName('control-panel')[0];
const canvasCtx = canvasElement.getContext('2d');

const solutionOptions = {
  selfieMode: true,
  enableFaceGeometry: false,
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
};

// We'll add this to our control panel later, but we'll save it here so we can
// call tick() each time the graph runs.
const fpsControl = new controls.FPS();

// Optimization: Turn off animated spinner after its hiding animation is done.
const spinner = document.querySelector('.loading');
spinner.ontransitionend = () => {
  spinner.style.display = 'none';
};

function onResults(results) {
  // Hide the spinner.
  document.body.classList.add('loaded');

  // Update the frame rate.
  fpsControl.tick();

  const width = results.image.width;
  const height = results.image.height;

  // Update canvas size if needed
  if (canvasElement.width !== width || canvasElement.height !== height) {
    canvasElement.width = width;
    canvasElement.height = height;
  }

  // Clear canvas
  canvasCtx.clearRect(0, 0, width, height);

  if (results.multiFaceLandmarks) {
    for (const landmarks of results.multiFaceLandmarks) {
      // Calculate iris position and distance
      let irisLeftMinX = Infinity, irisLeftMaxX = -Infinity;
      let irisLeftMinY = Infinity, irisLeftMaxY = -Infinity;

      for (const point of mpFaceMesh.FACEMESH_LEFT_IRIS) {
        const point0 = landmarks[point[0]];
        irisLeftMinX = Math.min(irisLeftMinX, point0.x * width);
        irisLeftMaxX = Math.max(irisLeftMaxX, point0.x * width);
        irisLeftMinY = Math.min(irisLeftMinY, point0.y * height);
        irisLeftMaxY = Math.max(irisLeftMaxY, point0.y * height);
      }

      // Calculate iris center position
      const irisCenterX = (irisLeftMinX + irisLeftMaxX) / 2;
      const irisCenterY = (irisLeftMinY + irisLeftMaxY) / 2;

      // Update eye position for Three.js
      eyePosition = { x: irisCenterX, y: irisCenterY };

      // Calculate distance
      const dx = irisLeftMaxX - irisLeftMinX;
      const dX = 11.7; // Average iris diameter in mm
      const normalizedFocaleX = 1.40625;
      const fx = Math.min(width, height) * normalizedFocaleX;
      eyeDistance = (fx * (dX / dx)) / 10.0; // Convert to cm

      // Set eye detection flag
      hasDetectedEye = true;

      // Draw iris landmarks
      drawingUtils.drawConnectors(
        canvasCtx, landmarks, mpFaceMesh.FACEMESH_LEFT_IRIS,
        { color: '#30FF30', lineWidth: 1 }
      );
    }
  } else {
    // Reset eye detection if no face is detected
    hasDetectedEye = false;
    hasStartedMoving = false; // Reset movement flag when eye is lost
  }
}

// Initialize MediaPipe Face Mesh
const faceMesh = new mpFaceMesh.FaceMesh(config);
faceMesh.setOptions(solutionOptions);
faceMesh.onResults(onResults);

// Initialize Three.js
initThreeJS();
animate();

// Present a control panel through which the user can manipulate the solution options.
new controls.ControlPanel(controlsElement, solutionOptions)
  .add([
    new controls.StaticText({ title: 'MediaPipe Face Mesh' }),
    fpsControl,
    new controls.Toggle({ title: 'Selfie Mode', field: 'selfieMode' }),
    new controls.SourcePicker({
      onFrame: async (input, size) => {
        const aspect = size.height / size.width;
        let width, height;
        if (window.innerWidth > window.innerHeight) {
          height = window.innerHeight;
          width = height / aspect;
        } else {
          width = window.innerWidth;
          height = width * aspect;
        }
        canvasElement.width = width;
        canvasElement.height = height;
        await faceMesh.send({ image: input });
      }
    }),
    new controls.Slider({
      title: 'Max Number of Faces',
      field: 'maxNumFaces',
      range: [1, 4],
      step: 1
    }),
    new controls.Toggle({
      title: 'Refine Landmarks',
      field: 'refineLandmarks'
    }),
    new controls.Slider({
      title: 'Min Detection Confidence',
      field: 'minDetectionConfidence',
      range: [0, 1],
      step: 0.01
    }),
    new controls.Slider({
      title: 'Min Tracking Confidence',
      field: 'minTrackingConfidence',
      range: [0, 1],
      step: 0.01
    })
  ])
  .on((x) => {
    const options = x;
    videoElement.classList.toggle('selfie', options.selfieMode);
    faceMesh.setOptions(options);
  });