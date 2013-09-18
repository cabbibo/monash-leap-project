"use strict";

var canvasDiv;
var scene;
var camera;
var projector = new THREE.Projector();
var nearClip = 1, farClip = 1000;
var renderer;

// Oculus Rift variables. usingRift should be set externally.
if (usingRift) {
  var riftRenderer;
  var vrState = new vr.State();
}

// Variables to control graph physics
var springRestLength = 10;
var springK = 10;
var repulsionStrength = 80;
var dragConstant = 0.2;
var keyboardMoveSpeed = 50;
var mouseLookSensitivity = 2.5;

var pointerDragForce = 20;
var maxPointerDragAccel = 8000;
var stabilisingForce = 50; // Constant force applied to all nodes to stop slow movements

// Pointer-related variables
var fingerPointer = new THREE.Vector2(); // The finger being used for pointing
var pointerCursor; // The cursor that shows the position of the pointer

var selectedUser = null;
var grabbedUser = null;

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

// The context for drawing text bubbles
var drawingCanvas, drawingContext;

window.addEventListener('resize',
                          function(event) {
                            renderer.setSize(window.innerWidth, window.innerHeight);
                            camera.aspect = window.innerWidth/window.innerHeight;
                            camera.updateProjectionMatrix();
                          }
                         );

function initializeScene()
{
  var canvasWidth = window.innerWidth;
  var canvasHeight = window.innerHeight;

  renderer = new THREE.WebGLRenderer({clearColor: 0x000000, alpha: false, antialias: true});

  if (usingRift)
    riftRenderer = new THREE.OculusRiftEffect(renderer);
  else
    renderer.setSize(canvasWidth, canvasHeight);

  document.getElementById("WebGLCanvas").appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, canvasWidth / canvasHeight, nearClip, farClip);
  camera.position.set(0, 0, 60);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  scene.add(camera);

  var pointLight = new THREE.PointLight(0xFFFFFF);
  pointLight.position.set(0, 0, 0);
  camera.add(pointLight);

  var pointerTexture = THREE.ImageUtils.loadTexture("glow.png");
  var pointerSpriteMaterial = new THREE.SpriteMaterial({map: pointerTexture, alignment: THREE.SpriteAlignment.center, opacity: 1});
  pointerCursor = new THREE.Sprite(pointerSpriteMaterial);
  pointerCursor.scale.set(48, 48, 1);
  scene.add(pointerCursor);

  // Set up the canvas for drawing text bubbles
  drawingCanvas = document.createElement('canvas');
  drawingCanvas.width = 500;
  drawingCanvas.height = 40;
  drawingContext = drawingCanvas.getContext('2d');

  drawingContext.font = "Bold 16px Arial";
	drawingContext.fillStyle = "rgba(255,0,0,0.95)";
}

function TextBubble(text)
{
  this.texture = new THREE.Texture(drawingCanvas);
  this.material = new THREE.MeshBasicMaterial({map: this.texture});
  this.material.transparent = true;
  this.mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(drawingCanvas.width, drawingCanvas.height),
    this.material
  );

  if (text !== undefined)
    this.setText(text);
}

TextBubble.prototype.setText = function(text) {
  drawingContext.fillText(text, 0, 50);
  this.texture.needsUpdate = true;
}

function buildGraph()
{
  User.getOrCreate("elonmusk").addFollowers(["nick", "tyson", "keren", "jon"]);
  User.getOrCreate("nick").addFollowers(["matt", "jordan", "michael"]);
  User.getOrCreate("obama").addFollowers(["elonmusk", "nick", "tyson", "kevinrudd", "jordan", "sam", "dilpreet"]);
  User.getOrCreate("kevinrudd").addFollowers(["juliagillard", "anthonyalbanese", "pennywong"]);
  User.getOrCreate("juliagillard").addFollowers(["kevinrudd"]);
  var rudd = User.get("kevinrudd");
  for (var i = 1; i < 100; ++i)
    rudd.addFollowers((new User(i)).name);

  //rudd.pinned = true;
}

var lastMouseX = 0, lastMouseY = 0;
var highlightedUser = null;
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

function update(deltaTime)
{
  Input.update();

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

    if (!grabbingHandCheckedIn && grabbedUser != null) {
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
        dy = -t[1] * leapRadiansPerMM;
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
        grabWithCurrentPointer();
      }
    }
  }

  // Now that we've checked for finger pointers, we can know whether
  // to interpet mouse input or not
  if (Input.currentPointer === Input.mouse) {
    if (Input.mouse.rightHeld) {
        var dx = (Input.mouse.x - lastMouseX) * mouseLookSensitivity;
        var dy = (Input.mouse.y - lastMouseY) * 0.7 * mouseLookSensitivity;
    }
  }

  lastMouseX = Input.mouse.x;
  lastMouseY = Input.mouse.y;

  // Move the pointer cursor sprite to the pointer's position
  var pc = NDCToPixelCoordinates(Input.currentPointer);
  pointerCursor.position.x = pc.x;
  pointerCursor.position.y = pc.y;

  // Highlight the user last under the pointer
  var newHighlightedUser = getUserUnderPointer(Input.currentPointer);
  if (newHighlightedUser !== null) {
    if (highlightedUser !== null) {
      highlightedUser.highlighted = false;
      highlightedUser = null;
    }
    highlightedUser = newHighlightedUser;
    highlightedUser.highlighted = true;
  }

  if (dz !== 0)
    camera.position.add(new THREE.Vector3(0, 0, dz).applyQuaternion(camera.quaternion));


  if (Input.keyboard.key['a']) {
    camera.position.add(new THREE.Vector3(-keyboardMoveSpeed*deltaTime, 0, 0).applyQuaternion(camera.quaternion));
  }
  if (Input.keyboard.key['d']) {
    camera.position.add(new THREE.Vector3(keyboardMoveSpeed*deltaTime, 0, 0).applyQuaternion(camera.quaternion));
  }
  if (Input.keyboard.key['w']) {
    camera.position.add(new THREE.Vector3(0, 0, -keyboardMoveSpeed*deltaTime).applyQuaternion(camera.quaternion));
  }
  if (Input.keyboard.key['s']) {
    camera.position.add(new THREE.Vector3(0, 0, keyboardMoveSpeed*deltaTime).applyQuaternion(camera.quaternion));
  }
  if (Input.keyboard.key['q']) {
    camera.position.add(new THREE.Vector3(0, -keyboardMoveSpeed*deltaTime, 0).applyQuaternion(camera.quaternion));
  }
  if (Input.keyboard.key['e']) {
    camera.position.add(new THREE.Vector3(0, keyboardMoveSpeed*deltaTime, 0).applyQuaternion(camera.quaternion));
  }

  for (var username in User.users) {
    User.get(username).calculateForces();
  }

  var centroid = new THREE.Vector3();

  // Apply net force for each node
  for (var username in User.users) {
    var user = User.get(username);
    user.updatePosition(deltaTime);
    centroid.add(user.sphere.position);
  }

  centroid.divideScalar(Object.keys(User.users).length);

  var displacement = centroid.clone().sub(camera.position);
  // Move the camera to the centroid
  camera.position.add(displacement);

  // Rotate the camera
  if (dx !== 0) {
    camera.rotateOnAxis(new THREE.Vector3(0, 1, 0).applyQuaternion(backwardsRotation), dx);
  }
  if (dy !== 0) {
    camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), -dy);
  }

  // Apply the same rotation we made to the camera to the displacement vector
  displacement.applyQuaternion(camera.quaternion.clone().multiply(backwardsRotation));
  // Move the camera away from the centroid again
  camera.position.sub(displacement);

  for (var username in User.users) {
    var user = User.get(username);
    orientTowardsCamera(user.catPicMesh);
    if (user.textBubble !== undefined)
      orientTowardsCamera(user.textBubble.mesh);
  }

  Input.reset();
}

var fingerSmoothingLevel = 5;
var fingerPositions = new Array(fingerSmoothingLevel);
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
  var NDC = new THREE.Vector2();
  NDC.x = smoothed[0];
  NDC.y = smoothed[1];
  return NDC;
}

function averageOfVectors(vs, smoothingLevel)
{
  var result = new Array(vs.length);
  for (var i = 0; i < vs.length; ++i) {
    result[i] = 0;
    for (var j = 0; j < smoothingLevel; ++j)
      result[i] += vs[j][i];
    result[i] /= smoothingLevel;
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

function getUserUnderPointer(pointer)
{
  var pointerNDC = new THREE.Vector3(pointer.x, pointer.y, 1);
  projector.unprojectVector(pointerNDC, camera);
  var directionVector = pointerNDC.sub(camera.position);
  directionVector.normalize();

  var raycaster = new THREE.Raycaster(camera.position, directionVector, nearClip, farClip);
  var intersected = raycaster.intersectObjects(scene.children);

  for (var i = 0; i < intersected.length; ++i) {
    if (intersected[i].object.user !== undefined) {
      return User.get(intersected[i].object.user);
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

function grabWithCurrentPointer()
{
  // Safeguard in case we still have somebody grabbed
  if (grabbedUser !== null) {
    grabbedUser.grabbed = false;
    grabbedUser = null;
  }
  var newSelectedUser = getUserUnderPointer(Input.currentPointer);
  if (newSelectedUser !== null) {
    if (selectedUser !== null) selectedUser.selected = false;
    selectedUser = newSelectedUser;
    selectedUser.selected = true;

    grabbedUser = selectedUser;
    grabbedUser.grabbed = true;
    grabbedUser.textBubble = new TextBubble("TEST");
    grabbedUser.sphere.add(grabbedUser.textBubble.mesh);
  }
}

function releaseGrab()
{
  if (grabbedUser !== null) {
    grabbedUser.grabbed = false;
    grabbedUser = null;
  }
}

function orientTowardsCamera(mesh)
{
  mesh.quaternion.copy(camera.quaternion);
  mesh.quaternion.x *= -1;
  mesh.quaternion.y *= -1;
  mesh.quaternion.z *= -1;
  mesh.quaternion.w *= -1;
}

// Extra function for printing vectors when debugging
function printVector(v)
{
  console.log(v.x + ", " + v.y + ((typeof v.z !== "undefined")? (", " + v.z) : ""));
}

require(["Input", "User"], main);
var Input, User;

var requestAnimFrame = (function() {
    return  window.requestAnimationFrame       ||
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

function main(i, u) {
  Input = i;
  User = u;

  // Change the selected user to the user under the mouse and grab the user under the mouse
  Input.mouse.leftPressedCallback = grabWithCurrentPointer;

  Input.mouse.leftReleasedCallback = releaseGrab;

  initializeScene();
  buildGraph();
  timeOfLastFrame = new Date().getTime();
  mainLoop();
}
