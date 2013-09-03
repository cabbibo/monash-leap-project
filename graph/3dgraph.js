"use strict";

var scene;
var camera;
var nearClip = 1, farClip = 100;
var renderer;
var mouse = new THREE.Vector2();

function mainLoop()
{
  nextUpdate();
  draw();
}

var sphereRadius = 1;
var sphereSegments = 16;
var sphereRings = 16;

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
  pointLight.position.set(0, 0, 30);
  scene.add(pointLight);
}

function buildGraph()
{
  var elon = new User("elonmusk");
  elon.followers = elon.followers.concat(["nick", "tyson", "keren", "jon"]);
  var nick = new User("nick");
  nick.followers = nick.followers.concat(["matt", "jordan", "michael"]);
  var obama = new User("obama");
  obama.followers = obama.followers.concat(["elonmusk", "nick", "tyson", "kevinrudd", "jordan", "sam", "dilpreet"]);
  var rudd = new User("kevinrudd");
  rudd.followers = rudd.followers.concat(["juliagillard", "anthonyalbanese", "pennywong"]);
  rudd.pinned = true;
  var gillard = new User("juliagillard");
  gillard.followers = gillard.followers.concat(["kevinrudd"]);
  new User("tyson");
  new User("keren");
  new User("jon");
  new User("matt");
  new User("jordan");
  new User("michael");
  new User("sam");
  new User("dilpreet");
  new User("anthonyalbanese");
  new User("pennywong");
  for (var i = 1; i < 100; ++i)
    new User(i);
  for (var i = 1; i < 100; ++i)
    rudd.followers = rudd.followers.concat(i);
  elon.drawNewEdges();
  nick.drawNewEdges();
  obama.drawNewEdges();
  rudd.drawNewEdges();
  gillard.drawNewEdges();
}

// A hash table to store all collected Twitter users
var users = {};
var springRestLength = 10;
var springK = 10;
var repulsionStrength = 80;
var dragConstant = 0.2;
var mouseDragForce = 200;
var stabilisingForce = 50; // Constant force applied to all nodes to stop slow movements

function User(name)
{
  User[name] = this;
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
}

User.prototype.sphereMaterial = new THREE.MeshLambertMaterial({color: 0x00F2FF});

User.prototype.drawNewEdges = function() {
  for (var i = 0; i < this.followerEdges.length; ++i) {
    this.followerEdges[i].remove();
  }
  this.followerEdges = new Array();
  NEXT_FOLLOWER: for (var i = 0; i < this.followers.length; ++i) {
    var follower = User[this.followers[i]];

    if (follower !== undefined) {
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
}

User.prototype.calculateForces = function() {

  // Add spring forces between self and followers
  for (var i = 0; i < this.followers.length; ++i) {
    var follower = User[this.followers[i]];

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
    for (var p in User) {
      var neighbour = User[p];
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
    var mouseRay = new THREE.Vector3(mouse.x, mouse.y, 1);
    projector.unprojectVector(mouseRay, camera);
    mouseRay.sub(camera.position);
    var factor = (this.sphere.position.z - camera.position.z) / mouseRay.z;
    var mousePosition = camera.position.clone().add(mouseRay.multiplyScalar(factor));
    var displacement = mousePosition.sub(this.sphere.position);
    this.accel.add(displacement.multiplyScalar(mouseDragForce));
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

function update(deltaTime)
{
  for (var p in User) {
    User[p].calculateForces();
  }

  // Apply net force for each node
  for (var p in User) {
    User[p].updatePosition(deltaTime);
  }
}

function draw()
{
  renderer.render(scene, camera);
}

var selectedUser = null;
var projector = new THREE.Projector();
document.addEventListener('mousedown',
                        function(event) {
                          var directionVector = new THREE.Vector3(mouse.x, mouse.y, 1);
                          projector.unprojectVector(directionVector, camera);
                          directionVector.sub(camera.position);
                          directionVector.normalize();

                          var raycaster = new THREE.Raycaster(camera.position, directionVector, nearClip, farClip);
                          var intersected = raycaster.intersectObjects(scene.children);

                          for (var i = 0; i < intersected.length; ++i) {
                            if (intersected[i].object.user !== undefined) {
                              selectedUser = User[intersected[i].object.user];
                              selectedUser.selected = true;
                              break;
                            }
                          }
                        }
                       );
document.addEventListener('mouseup',
                        function(event) {
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

function printVector(v)
{
  console.log(v.x + ", " + v.y + ", " + v.z)
}

initializeScene();
buildGraph();
timeOfLastFrame = new Date().getTime();
setInterval(mainLoop, 1000/60);















