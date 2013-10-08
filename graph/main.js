"use strict";

// FEATURE FLAGS
var grabbingEnabled = false;
var usingRift = false;

// Graphics variables
var scene;
var camera;
var projector = new THREE.Projector();
var nearClip = 1, farClip = 1000;
var renderer;

// Oculus Rift variables
if (usingRift) {
  var riftRenderer;
  var vrState = new vr.State();
}

// Control variables
var keyboardMoveSpeed = 50;
var mouseLookSensitivity = 2.5;

// Pointer/selection/interaction variables
var fingerPointer = new THREE.Vector2(); // The finger being used for pointing
var pointerCursor; // The cursor that shows the position of the pointer

var selectedNode = null;
var grabbedNode = null;

// Node switching transition variables
var nodeSwitchingTime = 2;
var maxSwitchingSpeedMultiplier = 5;
var nodeSwitchingCurveConstant = 4 / (nodeSwitchingTime * nodeSwitchingTime) * (maxSwitchingSpeedMultiplier-1);

// Leap Motion variables
var leapMetresPerMM = 0.5;
var leapRadiansPerMM = 0.02;
var screenAspectRatio = 16/9;
var screenSize = 15.6 * 25.4; // in mm
//var screenSize = 24 * 25.4;
var screenHeight = Math.sqrt(screenSize*screenSize/(screenAspectRatio*screenAspectRatio + 1));
var screenWidth = Math.sqrt(screenSize*screenSize - screenHeight*screenHeight);
var leapDistance = 250; // in mm
//var leapDistance = 600;
var leapHeight = 0; //relative to the bottom of the display
//var leapHeight = -250;

// The context for drawing 2d graphics
var drawingCanvas, drawingContext;

window.addEventListener('resize',
                          function(event) {
                            renderer.setSize(window.innerWidth, window.innerHeight);
                            camera.aspect = window.innerWidth/window.innerHeight;
                            camera.updateProjectionMatrix();
                          }
                         );

// Models the motion as we move the camera between nodes
function smoothMoveFunction(x)
{
  return 0.5*Math.atan(3.1148154*(x-0.5)) + 0.5;
}

function initializeScene()
{
  var canvasWidth = window.innerWidth;
  var canvasHeight = window.innerHeight;

  renderer = new THREE.WebGLRenderer({setClearColor: 0x000000, alpha: false, antialias: true});

  if (usingRift)
    riftRenderer = new THREE.OculusRiftEffect(renderer);
  else
    renderer.setSize(canvasWidth, canvasHeight);

  document.getElementById("WebGLCanvas").appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, canvasWidth / canvasHeight, nearClip, farClip);
  camera.position.set(0, 0, 30);
  scene.add(camera);

  var pointLight = new THREE.PointLight(0xFFFFFF);
  pointLight.position.set(0, 0, 0);
  camera.add(pointLight);

  var pointerTexture = THREE.ImageUtils.loadTexture("glow.png");
  var pointerSpriteMaterial = new THREE.SpriteMaterial({map: pointerTexture, alignment: THREE.SpriteAlignment.center, opacity: 1});
  pointerCursor = new THREE.Sprite(pointerSpriteMaterial);
  pointerCursor.scale.set(48, 48, 1);
  scene.add(pointerCursor);

  // Create the canvas for drawing 2d graphics
  drawingCanvas = document.createElement('canvas');
  drawingContext = drawingCanvas.getContext('2d');
}

function buildGraph()
{
  Node.newNodeLoadedFromScreenName("PootPooter", function(node) {
    if (node) {
      node.show();
      select(node);
    }
    else console.log("Failed to load starting user!");
  });
}

var lastMouseX = 0, lastMouseY = 0;
var highlightedNode = null;
var fingerLostMaxLenience = 10;
var fingerLostLenience = 0;
var pointingHandID = -1;
var pointingHandCheckedIn = false;
var maxPointingHandGrace = 10;
var pointingHandGrace = 0;
var grabbingHandCheckedIn = false;
var maxGrabbingHandGrace = 10;
var grabbingHandGrace = 0;
var maxGrabWarmup = 0.2;
var grabWarmup = -2; // -1 is 'ready' value, -2 is 'finished' value

var coroutines = new Array();

function setCoroutine(data, func)
{
  data.func = func;
  coroutines.push(data);
}

function update(deltaTime)
{
  Input.update();

  // Execute coroutines
  for (var i = 0; i < coroutines.length;) {
    if (coroutines[i].func(coroutines[i], deltaTime))
      coroutines.splice(i, 1);
    else
      ++i;
  }

  // Rift config buttons
  if (usingRift) {
    if (Input.keyboard.keyPressed['f']) {
      if (!vr.isFullScreen())
        vr.enterFullScreen();
      else
        vr.exitFullScreen();
    }
    if (Input.keyboard.keyPressed[' '])
      vr.resetHmdOrientation();
    if (Input.keyboard.keyPressed['o'])
      riftRenderer.setInterpupillaryDistance(
                  riftRenderer.getInterpupillaryDistance() - 0.001);
    if (Input.keyboard.keyPressed['p'])
      riftRenderer.setInterpupillaryDistance(
                  riftRenderer.getInterpupillaryDistance() + 0.001);
  }

  var backwardsRotation = camera.quaternion.clone();
  backwardsRotation.x *= -1;
  backwardsRotation.y *= -1;
  backwardsRotation.z *= -1;

  var dx = 0, dy = 0, dz = 0;
  // Reset the finger point position every frame so that the finger spot
  // isn't drawn when we lose sight of the finger

  // Check for hand motions and gestures

  var hands = Input.currLeapFrame.hands;
  if (hands.length > 0) {
    checkHandInput(hands[0]);
    if (hands.length > 1)
      checkHandInput(hands[1]);
  }

  // Missing hands (or missing gestures) are addressed here,
  // with a grace period for their return
  if (pointingHandID !== -1) {
    if (!pointingHandCheckedIn) {
      --pointingHandGrace;
      if (pointingHandGrace < 0) {
        pointingHandID = -1;
      }
    }
    else pointingHandGrace = maxPointingHandGrace;

    if (!grabbingHandCheckedIn && grabbedNode != null) {
      --grabbingHandGrace;
      if (grabbingHandGrace < 0) {
        releaseGrab();
      }
    }
    else grabbingHandGrace = maxGrabbingHandGrace;
  }
  pointingHandCheckedIn = false;
  grabbingHandCheckedIn = false;

  function checkHandInput(hand) {
    var fingers = hand.fingers;

    if (fingers.length === 1) {
      Input.currentPointer = fingerPointer;

      // Try and claim this hand as the pointing hand
      if (pointingHandID === -1) {
        pointingHandID = hand.id;
      }

      if (pointingHandID === hand.id) {
        pointingHandCheckedIn = true;
        if (fingerPointer.id !== fingers[0].id) {
          // Give a few frames slack if we can't find the finger we had before
          if (fingerLostLenience > 0) {
            --fingerLostLenience;
            return;
          }
          else {
            fingerPointer.id = fingers[0].id;
          }
        }
        fingerLostLenience = fingerLostMaxLenience;
        fingerPointer.copy(getFingerOnScreenNDC(fingers[0]));
      }
    }
    else if (pointingHandID === hand.id && fingers.length === 2) {
      // If we see two fingers but one is the finger we were already tracking,
      // ignore the second finger.
      pointingHandCheckedIn = true;
      if (fingers[0].id === fingerPointer.id) {
        fingerPointer.copy(getFingerOnScreenNDC(fingers[0]));
        console.log("Lenient.");
      }
      else if (fingers[1].id === fingerPointer.id) {
        fingerPointer.copy(getFingerOnScreenNDC(fingers[1]));
        console.log("Lenient.");
      }
    }

    if (pointingHandID === -1) {
      if (fingers.length >= 4) {
        var t = hand.translation(Input.prevLeapFrame);
        dx = -t[0] * leapRadiansPerMM;
        dy = t[1] * leapRadiansPerMM;
        dz = -t[2] * leapMetresPerMM;
      }
    }
    else if (pointingHandID !== hand.id) {
      grabbingHandCheckedIn = true;
      if (grabWarmup === -1) {
        if (fingers.length < 2) {
          grabWarmup = maxGrabWarmup;
        }
      }
      else if (fingers.length >= 4) {
        releaseGrab();
        grabWarmup = -1;
      }
      else if (grabWarmup > 0) {
        grabWarmup -= deltaTime;
      }
      else if (grabWarmup !== -2) {
        grabWarmup = -2;
        selectWithCurrentPointer();
      }
    }
  }

  // Now that we've checked for finger pointers, we can know whether
  // to interpet mouse input or not
  if (Input.currentPointer === Input.mouse) {
    if (Input.mouse.rightHeld) {
      dx = -(Input.mouse.x - lastMouseX) * mouseLookSensitivity;
      dy = (Input.mouse.y - lastMouseY) * 0.7 * mouseLookSensitivity;
    }
  }

  lastMouseX = Input.mouse.x;
  lastMouseY = Input.mouse.y;

  // Move the pointer cursor sprite to the pointer's position
  var pc = NDCToPixelCoordinates(Input.currentPointer);
  pointerCursor.position.x = pc.x;
  pointerCursor.position.y = pc.y;

  // Highlight the node last under the pointer
  var newHighlightedNode = getNodeUnderPointer(Input.currentPointer);
  if (newHighlightedNode !== null) {
    unhighlight();
    highlight(newHighlightedNode);
  }

  if (Input.keyboard.key['w'])
    dz = -keyboardMoveSpeed*deltaTime;

  if (Input.keyboard.key['s'])
    dz = keyboardMoveSpeed*deltaTime;

    var displacement = centreOfFocus.clone().sub(camera.position);
  // Move the camera to the centroid
  camera.position.add(displacement);

  // Rotate the camera
  if (dx !== 0)
    camera.rotateOnAxis(new THREE.Vector3(0, 1, 0), dx);
  if (dy !== 0)
    camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), dy);
  if (dz !== 0)
    camera.position.add(new THREE.Vector3(0, 0, dz).applyQuaternion(camera.quaternion));

  // Apply the same rotation we made to the camera to the displacement vector
  displacement.applyQuaternion(camera.quaternion.clone().multiply(backwardsRotation));
  // Move the camera away from the centroid again
  camera.position.sub(displacement);

  for (var username in Node.shownNodes) {
    Node.shownNodes[username].calculateForces();
  }

  // Apply net force for each node
  for (var username in Node.shownNodes) {
    Node.shownNodes[username].updatePosition(deltaTime);
  }

  for (var username in Node.shownNodes) {
    Node.shownNodes[username].orient(camera.quaternion);
  }

  Input.reset();
}

var fingerSmoothingLevel = 3;
var fingerPositions = new Array();
for (var i = 0; i < fingerSmoothingLevel; ++i)
  fingerPositions[i] = [1, 1, 1];
var fpi = 0;

// Gets the position of the finger on the screen in Normalized Device Coordinates
function getFingerOnScreenNDC(finger)
{
  var pos = finger.tipPosition.slice(0);
  var dir = finger.direction;

  // Get the position of the finger tip relative to screen centre
  pos[1] += leapHeight - screenHeight/2;
  pos[2] += leapDistance;
  // Follow finger tip over to screen surface
  var factor = -pos[2] / dir[2];
  pos[0] += dir[0]*factor;
  pos[1] += dir[1]*factor;
  pos[2] += dir[2]*factor;
  // pos[0] & pos[1] are now mm from screen centre
  // Calculate the pointing position on the virtual screen from [-1, 1] (Normalized Device Coordinates)
  fingerPositions[fpi] = [pos[0] / (0.5*screenWidth), pos[1] / (0.5*screenHeight)];
  fpi = (fpi+1)%fingerSmoothingLevel;
  var smoothed = averageOfVectors(fingerPositions, fingerSmoothingLevel);
  console.log(smoothed);
  var NDC = new THREE.Vector2();
  NDC.x = smoothed[0];
  NDC.y = smoothed[1];
  return NDC;
}

function averageOfVectors(vectors, numVectors)
{
  var result = new Array();
  for (var i = 0; i < vectors[0].length; ++i) {
    result[i] = 0;
    for (var j = 0; j < numVectors; ++j)
      result[i] += vectors[j][i];
    result[i] /= numVectors;
  }
  return result;
}

function NDCToPixelCoordinates(NDC)
{
  var pixelCoords = new THREE.Vector2();
  pixelCoords.x = (NDC.x + 1)/2 * window.innerWidth;
  pixelCoords.y = (-NDC.y + 1)/2 * window.innerHeight;
  return pixelCoords;
}

function getNodeUnderPointer(pointer)
{
  var pointerNDC = new THREE.Vector3(pointer.x, pointer.y, 1);
  projector.unprojectVector(pointerNDC, camera);
  var directionVector = pointerNDC.sub(camera.position);
  directionVector.normalize();

  var raycaster = new THREE.Raycaster(camera.position, directionVector, nearClip, farClip);
  var intersected = raycaster.intersectObjects(scene.children);

  for (var i = 0; i < intersected.length; ++i) {
    if (intersected[i].object.node !== undefined) {
      return intersected[i].object.node;
    }
  }

  return null;
}

function draw()
{
  if (usingRift) {
    var polled = vr.pollState(vrState);
    riftRenderer.render(scene, camera, polled ? vrState : null);
  }
  else renderer.render(scene, camera);
}

function selectWithCurrentPointer()
{
  // Safeguard in case we still have somebody grabbed
  releaseGrab();
  var newSelectedNode = getNodeUnderPointer(Input.currentPointer);
  if (newSelectedNode !== null) {
    select(newSelectedNode);
    if (grabbingEnabled) grab(selectedNode);
  }
}

function highlight(node)
{
  highlightedNode = node;
  node.highlight();
}

function unhighlight()
{
  if (highlightedNode !== null) {
    highlightedNode.unhighlight();
    highlightedNode = null;
  }
}

var centreOfFocus = new THREE.Vector3();

// Select the given node. We allow no deselection
// without subsequent selection because we must
// always have a node as the centre of focus.
function select(node)
{
  if (selectedNode !== null) {
    selectedNode.deselect();
    var displacement = node.position.clone().sub(centreOfFocus);


    setCoroutine({currentTime: 0, endTime: nodeSwitchingTime, target: node.position, displacement: new THREE.Vector3()},
                 function(o, deltaTime) {
                   function speedMultiplier(x) {
                     return 1 - nodeSwitchingCurveConstant*x*(x-o.endTime);
                   }

                   deltaTime *= speedMultiplier(o.currentTime);
                   o.currentTime += deltaTime;

                   if (o.currentTime >= o.endTime) {
                     camera.position.add(displacement.copy(o.target).sub(centreOfFocus));
                     centreOfFocus.copy(o.target);
                     return true;
                   }
                   else {
                     o.displacement.copy(o.target).sub(centreOfFocus).multiplyScalar(deltaTime/(o.endTime-o.currentTime));
                     centreOfFocus.add(o.displacement);
                     camera.position.add(o.displacement);
                   }
                 }
    );
  }
  else {
    centreOfFocus.copy(node.position);
    camera.lookAt(centreOfFocus);
  }

  selectedNode = node;
  node.select();
  node.showProfile();
}

function grab(node)
{
  grabbedNode = node;
  node.grab();
}

function releaseGrab()
{
  if (grabbedNode !== null) {
    grabbedNode.releaseGrab();
    grabbedNode = null;
  }
}

// Extra function for printing vectors when debugging
function printVector(v)
{
  console.log(v.x + ", " + v.y + ((typeof v.z !== "undefined")? (", " + v.z) : ""));
}

require(["Input", "UserNode"], main);
var Input, Node;

var requestAnimFrame = (function() {
  return  window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame    ||
    window.oRequestAnimationFrame      ||
    window.msRequestAnimationFrame     ||
    function(callback) {
    window.setTimeout(callback, 1000 / 60);
  };
})();

function mainLoop()
{
  nextUpdate();
  draw();
  requestAnimFrame(mainLoop);
}

var frameTimeLimit = 0.03;
var timeOfLastFrame = 0;

function nextUpdate()
{
  var currentTime = new Date().getTime();
  var deltaTime = (currentTime - timeOfLastFrame)/1000;
  timeOfLastFrame = currentTime;

  // Limit the maximum time step to avoid unexpected results
  if (deltaTime > frameTimeLimit)
    update(frameTimeLimit);
  else
    update(deltaTime);
}

function main(i, n) {
  Input = i;
  Node = n;

  Input.mouse.leftPressedCallback = selectWithCurrentPointer;
  Input.mouse.leftReleasedCallback = releaseGrab;

  initializeScene();
  buildGraph();
  timeOfLastFrame = new Date().getTime();
  mainLoop();
}








