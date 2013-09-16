"use strict";

var scene;
var camera;
var projector = new THREE.Projector();
var nearClip = 1, farClip = 1000;
var renderer;

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
var leapRadiansPerMM = 0.005;
var screenAspectRatio = 16/9;
//var screenSize = 15.6 * 25.4; // in mm
var screenSize = 24 * 25.4;
var screenHeight = Math.sqrt(screenSize*screenSize/(screenAspectRatio*screenAspectRatio + 1));
var screenWidth = Math.sqrt(screenSize*screenSize - screenHeight*screenHeight);
//var leapDistance = 250; // in mm
var leapDistance = 600;
//var leapHeight = 0; //relative to the bottom of the display
var leapHeight = -250;

window.addEventListener('resize',
                          function(event) {
                            renderer.setSize(window.innerWidth, window.innerHeight);
                            camera.aspect = window.innerWidth/window.innerHeight;
                            camera.updateProjectionMatrix();
                          }
                         );

function mainLoop()
{
  nextUpdate();
  draw();
}


function initializeScene()
{
  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setClearColor(0x000000, 1);

  var canvasWidth = window.innerWidth;
  var canvasHeight = window.innerHeight;

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

var lastMouseX = 0, lastMouseY = 0;
var highlightedUser = null;

function update(deltaTime)
{
  Input.update();

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

  function checkHandInput(hand) {
    if (hand.fingers.length === 1) {
      Input.currentPointer = fingerPointer;
      fingerPointer.copy(getFingerOnScreenNDC(hand.fingers[0]));
    }
    else if (hand.fingers.length >= 4) {
      var t = hand.translation(Input.prevLeapFrame);
      dx = -t[0] * leapRadiansPerMM;
      dy = -t[1] * leapRadiansPerMM;
      dz = -t[2] * leapMetresPerMM;
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
      highlightedUser.sphere.material = User.standardSphereMat;
      highlightedUser = null;
    }
    highlightedUser = newHighlightedUser;
    highlightedUser.sphere.material = User.redSphereMat;
  }

  if (dx !== 0)
    camera.rotateOnAxis(new THREE.Vector3(0, 1, 0).applyQuaternion(backwardsRotation), -dx);
  if (dy !== 0)
    camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), dy);
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

  // Apply net force for each node
  for (var username in User.users) {
    User.get(username).updatePosition(deltaTime);
  }
}

// Gets the position of the finger on the screen in Normalized Device Coordinates
function getFingerOnScreenNDC(finger)
{
  var pos = finger.stabilizedTipPosition;
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
  // get the pointing position on the virtual screen from [-1, 1] (Normalized Device Coordinates)
  var NDC = new THREE.Vector2();
  NDC.x = pos[0] / (0.5*screenWidth);
  NDC.y = pos[1] / (0.5*screenHeight);
  return NDC;
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
  renderer.render(scene, camera);
}

// Extra function for printing vectors when debugging
function printVector(v)
{
  console.log(v.x + ", " + v.y + ((typeof v.z !== "undefined")? (", " + v.z) : ""));
}

require(["Input", "User"], main);
var Input, User;

function main(i, u) {
  Input = i;
  User = u;

  // Change the selected user to the user under the mouse and grab the user under the mouse
  Input.mouse.leftPressedCallback = function() {
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
    }
  };

  Input.mouse.leftReleasedCallback = function() {
    if (grabbedUser !== null) {
      grabbedUser.grabbed = false;
      grabbedUser = null;
    }
  };

  initializeScene();
  buildGraph();
  timeOfLastFrame = new Date().getTime();
  setInterval(mainLoop, 1000/60);
}





