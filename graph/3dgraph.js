"use strict";

var scene;
var camera;
var projector = new THREE.Projector();
var nearClip = 1, farClip = 1000;
var renderer;

// Variables for node models
var sphereRadius = 1;
var sphereSegments = 16;
var sphereRings = 16;

// A hash table to store all collected Twitter users
var users = {};
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
var currentPointer; // Holds a reference to the currently-used pointer object (mouse or fingertip)
var mouse = new THREE.Vector2();
mouse.x = 0; mouse.y = 0;
var fingertip = new THREE.Vector2();
fingertip.x = 0; fingertip.y = 0;
var selectedUser = null;

// Leap controller variables
var controller = new Leap.Controller();

controller.on('connect', function() {
  console.log("Successfully connected.");
});

controller.on('deviceConnected', function() {
  console.log("A Leap device has been connected.");
});

controller.on('deviceDisconnected', function() {
  console.log("A Leap device has been disconnected.");
});

controller.connect();

var leapMetresPerMM = 0.5;
var leapRadiansPerMM = 0.005;
var screenAspectRatio = 16/9;
var screenSize = 15.6 * 25.4; // in mm
var screenHeight = Math.sqrt(screenSize*screenSize/(screenAspectRatio*screenAspectRatio + 1));
var screenWidth = Math.sqrt(screenSize*screenSize - screenHeight*screenHeight);
var leapDistance = 250; // in mm
var leapHeight = 0; //relative to the bottom of the display


function mainLoop()
{
  nextUpdate();
  draw();
  resetKeys();
}

// EVENT CODE

document.addEventListener('mousedown',
                        function(event) {
                          // Which mouse button?
                          switch (event.which) {
                            case 1:
                              mouse.leftHeld = true;
                              selectUserAtScreenPosition(mouse);
                              break;
                            case 2:
                              mouse.middleHeld = true;
                              break;
                            case 3:
                              mouse.rightHeld = true;
                          }

                        }
                       );
document.addEventListener('mouseup',
                        function(event) {
                          switch (event.which) {
                            case 1:
                              mouse.leftHeld = false;
                              break;
                            case 2:
                              mouse.middleHeld = false;
                              break;
                            case 3:
                              mouse.rightHeld = false;
                          }
                          if (selectedUser !== null) {
                            selectedUser.selected = false;
                            selectedUser = null;
                          }
                        }
                       );
document.addEventListener('mousemove',
                          function(event) {
                            event.preventDefault();

                            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                            mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
                          },
                          false);
window.addEventListener('resize',
                        function(event) {
                          renderer.setSize(window.innerWidth, window.innerHeight);
                          camera.aspect = window.innerWidth/window.innerHeight;
                          camera.updateProjectionMatrix();
                        }
                       );

// Keyboard input handling
var keyboard = {};
keyboard.key = {};
keyboard.keyToggle = {};
keyboard.keyPressed = {};
keyboard.keyReleased = {};

function translateKeycode(code) {
  if (code>=65 && code<65+26) return "abcdefghijklmnopqrstuvwxyz"[code-65];
  if (code>=48 && code<48+10) return "0123456789"[code-48];
  if (code>=37 && code<=40) return "AWDS"[code-37]; // arrow keys labelled in WASD fashion

  if (code==32) return ' '; // space
  if (code==27) return 0x1B; // esc
  if (code==192) return '`'; // backtick/tilde
  if (code==13) return '\n'; // newline
  if (code==59) return ';';
  if (code==61) return '=';
  if (code==173) return '-';

  return code; // unconverted numeric code
}

document.addEventListener('keydown',function(evt) {
  evt.preventDefault(); // don't do browser built-in search with key press
  var t = translateKeycode(evt.keyCode);

  if (!keyboard.key[t]) { // key wasn't pressed
    keyboard.keyToggle[t] = !keyboard.keyToggle[t];
    keyboard.keyPressed[t] = true;
  }
  keyboard.key[t] = true;
}, false);

document.addEventListener('keyup',function(evt) {
  var t = translateKeycode(evt.keyCode);
  keyboard.key[t] = false;
  keyboard.keyReleased[t] = true;
}, false);

function resetKeys()
{
  for (var t in keyboard.keyPressed) {
    keyboard.keyPressed[t] = false;
  }
  for (var t in keyboard.keyReleased) {
    keyboard.keyReleased[t] = false;
  }
}

// END EVENT CODE


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

function User(name)
{
  if (User.get(name) !== undefined) return false;
  User.users[name] = this;
  this.name = name;
  this.sphere = new THREE.Mesh(
    new THREE.SphereGeometry(
      sphereRadius,
      sphereSegments,
      sphereRings),
    this.sphereMaterial
  );

  this.sphere.user = name;
  this.sphere.position.set((Math.random()-0.5)*25, (Math.random()-0.5)*25, (Math.random()-0.5)*25-10);
  scene.add(this.sphere);
  this.velocity = new THREE.Vector3();
  this.accel = new THREE.Vector3();

  this.followers = new Array();
  this.followerEdges = new Array();

  /*
  this.sprite = new THREE.Sprite(catFaceSpriteMaterial);
	this.sprite.position.set(30, 0, -5);
  var scaleX = 100, scaleY = 100;
  this.sprite.scale.set( scaleX, scaleY, 1 );
	scene.add(this.sprite);
  */
  this.catPicMesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.sqrt(2), Math.sqrt(2), 1, 1), catFaceMaterial);
  this.sphere.add(this.catPicMesh);
}

// An associative array to store all created users
User.users = {};

User.get = function(name) {
  return User.users[name];
}

User.getOrCreate = function(name) {
  var user = User.get(name);
  if (user === undefined) {
    user = new User(name);
  }
  return user;
}

User.prototype.sphereMaterial = new THREE.MeshLambertMaterial({color: 0xFFFFFF, opacity: 0.3, transparent: true});
var catFaceTexture = THREE.ImageUtils.loadTexture("cat-face-grey.jpg");
var catFaceMaterial = new THREE.MeshBasicMaterial({map: catFaceTexture});
var catFaceSpriteMaterial = new THREE.SpriteMaterial( { map: catFaceTexture, alignment: THREE.SpriteAlignment.topLeft, opacity: 1 });
var redSphereMat = new THREE.MeshLambertMaterial({color: 0xFF0000});

// This method will rebuild all edges of a node.
// This currently only has a purpose if you change the follower list outside the addFollowers() method
User.prototype.rebuildEdges = function() {
  // Remove existing edges
  for (var i = 0; i < this.followerEdges.length; ++i) {
    this.followerEdges[i].remove();
  }
  this.followerEdges = new Array();
  NEXT_FOLLOWER: for (var i = 0; i < this.followers.length; ++i) {
    var follower = User.getOrCreate(this.followers[i]);

    var edges = follower.followerEdges;
    // If the person we're following is following us, update the existing edge
    for (var j = 0; j < edges.length; ++j) {
      if (edges[j].follower === this) {
        edges[j].lineGeo.colors[1].setHex(0xFF0000);
        continue NEXT_FOLLOWER;
      }
    }
    this.followerEdges[this.followerEdges.length] = new Edge(this, follower);
}
}

// Adds provided followers to the user.
// Input can be a single follower username or an array of usernames.
User.prototype.addFollowers = function(newFollowers) {
  this.followers = this.followers.concat(newFollowers);
  if (!(newFollowers instanceof Array))
    newFollowers = [newFollowers];

  NEXT_FOLLOWER: for (var i = 0; i < newFollowers.length; ++i) {
    var follower = User.getOrCreate(newFollowers[i]);

    var edges = follower.followerEdges;
    // If the person we're following is following us, update the existing edge
    for (var j = 0; j < edges.length; ++j) {
      if (edges[j].follower === this) {
        edges[j].lineGeo.colors[1].setHex(0xFF0000);
        continue NEXT_FOLLOWER;
      }
    }
    this.followerEdges[this.followerEdges.length] = new Edge(this, follower);
  }
}

User.prototype.calculateForces = function() {
  // Add spring forces between self and followers
  for (var i = 0; i < this.followers.length; ++i) {
    var follower = User.get(this.followers[i]);

    if (follower !== undefined) {
      var displacement = (new THREE.Vector3()).subVectors(follower.sphere.position, this.sphere.position);
      var length = displacement.length();
      if (length > 0) {
        var accel = displacement.multiplyScalar(springK*(length-springRestLength)/length);
        if (!this.pinned)
          this.accel.add(accel);
        if (!follower.pinned)
          follower.accel.add(accel.multiplyScalar(-1));
      }
    }
  }

  if (!this.pinned) {
    // Add forces from node proximity
    for (var username in User.users) {
      var neighbour = User.get(username);
      if (neighbour !== this) {
        var displacement = (new THREE.Vector3()).subVectors(neighbour.sphere.position, this.sphere.position);
        var length = displacement.length();
        displacement.multiplyScalar(-repulsionStrength/length/length/length);
        this.accel.add(displacement);
      }
    }
  }

  // Add force from being dragged around via interaction
  if (this.selected) {

    //this.sphere.update();
    // Set the pointer depth in 3D to the node depth (in screen space)
    var nodePos = projector.projectVector(this.sphere.position.clone(), camera);
    var pointerPos = new THREE.Vector3(currentPointer.x, currentPointer.y, nodePos.z);
    // Now in world space
    projector.unprojectVector(pointerPos, camera);

    // Displacement of the pointer pointer from the node
    var displacement = pointerPos.sub(this.sphere.position);
    // Force is proportional to square distance and drag force
    var newAccel = displacement.multiplyScalar(displacement.length() * pointerDragForce);
    var mag = newAccel.length();
    // Limit the maximum drag force
    if (mag > maxPointerDragAccel)
      newAccel.multiplyScalar(maxPointerDragAccel / mag);
    this.accel.add(newAccel);
  }
}

User.prototype.updatePosition = function(deltaTime) {
  // Add drag force
  this.accel.sub(this.velocity.clone().multiplyScalar(dragConstant*this.velocity.length()));
  // Update velocity
  this.velocity.add(this.accel.multiplyScalar(deltaTime));

  // Round to zero for very small velocities to stop slow drifting when node is not being dragged
  if (this.selected) {
    this.sphere.position.add(this.velocity.clone().multiplyScalar(deltaTime));
  }
  else {
    var vmag = this.velocity.length();
    var vdir = this.velocity.clone().divideScalar(vmag);
    var negatedVelocity = deltaTime*stabilisingForce;
    if (vmag > negatedVelocity) {
      vmag -= negatedVelocity;
    // Update position
    this.sphere.position.add(vdir.multiplyScalar(deltaTime*vmag));
    }
    else this.velocity.set(0, 0, 0);
  }

  // Reset forces
  this.accel.set(0, 0, 0);

  // Update edges
  for (var i = 0; i < this.followerEdges.length; ++i) {
    this.followerEdges[i].update();
  }
}

function Edge(followee, follower)
{
  this.followee = followee;
  this.follower = follower;

  this.lineGeo = new THREE.Geometry();
  this.lineGeo.dynamic = true;
  this.lineGeo.vertices.push(followee.sphere.position);
  this.lineGeo.vertices.push(follower.sphere.position);
  this.lineGeo.colors.push(new THREE.Color(0xFF0000));
  this.lineGeo.colors.push(new THREE.Color(0x0000FF));
  this.lineMesh = new THREE.Line(this.lineGeo, this.lineMaterial);
  scene.add(this.lineMesh);
}

Edge.prototype.lineMaterial = new THREE.LineBasicMaterial(
  {color: 0xFFFFFF, vertexColors: THREE.VertexColors}
);
Edge.prototype.update = function() {
  this.lineGeo.verticesNeedUpdate = true;
}
Edge.prototype.remove = function() {
  scene.remove(this.lineMesh);
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
var lastFrame = null;
var highlightedUser = null;

function update(deltaTime)
{
  var backwardsRotation = camera.quaternion.clone();
  backwardsRotation.x *= -1;
  backwardsRotation.y *= -1;
  backwardsRotation.z *= -1;

  var dx = 0, dy = 0, dz = 0;
  // Reset the finger point position every frame so that the finger spot
  // isn't drawn when we lose sight of the finger

  if (highlightedUser !== null) {
          highlightedUser.sphere.material = User.prototype.sphereMaterial;
    highlightedUser.sphere.updateMorphTargets();
    highlightedUser = null;
  }

  var frame = controller.frame(0);
  if (mouse.rightHeld) {
    var dx = (mouse.x - lastMouseX) * mouseLookSensitivity;
    var dy = (mouse.y - lastMouseY) * 0.7 * mouseLookSensitivity;

  }
  else if (frame.valid) {
    if (lastFrame !== null && lastFrame.valid) {
      var pointing = false;

      if (frame.fingers.length === 1) {
        pointing = true;
        var finger = frame.fingers[0];
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
        // get the pointing position on the virtual screen from [-1, 1]
        fingertip.x = pos[0] / (0.5*screenWidth);
        fingertip.y = pos[1] / (0.5*screenHeight);
        selectUserAtScreenPosition(fingertip);
        if (selectedUser !== null) {
          highlightedUser = selectedUser;
          selectedUser.sphere.material = redSphereMat;
          selectedUser.sphere.updateMorphTargets();
          selectedUser.selected = false;
          selectedUser = null;

          currentPointer = null;
        }
        if (keyboard.keyPressed[' ']) {
          selectUserAtScreenPosition(fingertip);
        }
      }
      else if (frame.fingers.length >= 4) {
        var t = frame.translation(lastFrame);
        dx = -t[0] * leapRadiansPerMM;
        dy = -t[1] * leapRadiansPerMM;
        dz = -t[2] * leapMetresPerMM;
      }

      if (!pointing && currentPointer === fingertip) {
        selectedUser.selected = false;
        selectedUser = null;
        currentPointer = null;
      }
    }
  }

  lastMouseX = mouse.x;
  lastMouseY = mouse.y;
  lastFrame = frame;

  if (dx !== 0)
    camera.rotateOnAxis(new THREE.Vector3(0, 1, 0).applyQuaternion(backwardsRotation), -dx);
  if (dy !== 0)
    camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), dy);
  if (dz !== 0)
    camera.position.add(new THREE.Vector3(0, 0, dz).applyQuaternion(camera.quaternion));


  if (keyboard.key['a']) {
    camera.position.add(new THREE.Vector3(-keyboardMoveSpeed*deltaTime, 0, 0).applyQuaternion(camera.quaternion));
  }
  if (keyboard.key['d']) {
    camera.position.add(new THREE.Vector3(keyboardMoveSpeed*deltaTime, 0, 0).applyQuaternion(camera.quaternion));
  }
  if (keyboard.key['w']) {
    camera.position.add(new THREE.Vector3(0, 0, -keyboardMoveSpeed*deltaTime).applyQuaternion(camera.quaternion));
  }
  if (keyboard.key['s']) {
    camera.position.add(new THREE.Vector3(0, 0, keyboardMoveSpeed*deltaTime).applyQuaternion(camera.quaternion));
  }
  if (keyboard.key['q']) {
    camera.position.add(new THREE.Vector3(0, -keyboardMoveSpeed*deltaTime, 0).applyQuaternion(camera.quaternion));
  }
  if (keyboard.key['e']) {
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

function selectUserAtScreenPosition(pointer)
{
  var pointOnScreen = new THREE.Vector3(pointer.x, pointer.y, 1);
  projector.unprojectVector(pointOnScreen, camera);
  var directionVector = pointOnScreen.sub(camera.position);
  directionVector.normalize();

  var raycaster = new THREE.Raycaster(camera.position, directionVector, nearClip, farClip);
  var intersected = raycaster.intersectObjects(scene.children);

  for (var i = 0; i < intersected.length; ++i) {
    if (intersected[i].object.user !== undefined) {
      selectedUser = User.get(intersected[i].object.user);
      selectedUser.selected = true;
      currentPointer = pointer;
      break;
    }
  }
}

function draw()
{
  renderer.render(scene, camera);
}

// Extra function for printing vectors when debugging
function printVector(v)
{
  console.log(v.x + ", " + v.y + ", " + v.z)
}

initializeScene();
buildGraph();
timeOfLastFrame = new Date().getTime();
setInterval(mainLoop, 1000/60);






















