"use strict";

var scene;
var camera;
var renderer;

function mainLoop()
{
  update();
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

  camera = new THREE.PerspectiveCamera(45, canvasWidth / canvasHeight, 1, 100);
  camera.position.set(0, 0, 50);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  scene.add(camera);

  var pointLight = new THREE.PointLight(0xFFFFFF);
  pointLight.position.set(0, 0, 10);
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
var repulsionStrength = 25;
var dragConstant = 0.05;

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

  this.sphere.position.set((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*15-10);
  scene.add(this.sphere);
  this.velocity = new THREE.Vector3();
  this.accel = new THREE.Vector3();

  this.followers = new Array();
  this.followerEdges = new Array();
}

User.prototype.sphereMaterial = new THREE.MeshLambertMaterial({color: 0xFFFFFF});

User.prototype.drawNewEdges = function() {
  for (var i = 0; i < this.followerEdges.length; ++i) {
    this.followerEdges[i].remove();
  }
  this.followerEdges = new Array();
  for (var i = 0; i < this.followers.length; ++i) {
    var follower = User[this.followers[i]];

    if (follower !== undefined)
      this.followerEdges[this.followerEdges.length] = new Edge(this, follower);
  }
}

User.prototype.calculateForces = function() {
  // Add forces from follower connections
  for (var i = 0; i < this.followers.length; ++i) {
    var follower = User[this.followers[i]];

    if (follower !== undefined) {
      var displacement = (new THREE.Vector3()).subVectors(follower.sphere.position, this.sphere.position);
      var length = displacement.length();
      if (length > 0) {
        var accel = displacement.multiplyScalar(springK*(length-springRestLength)/length);
        this.accel.add(accel);
        follower.accel.add(accel.multiplyScalar(-1));
      }
    }
  }

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

User.prototype.updatePosition = function(deltaTime) {
  // Add drag force
  this.accel.sub(this.velocity.clone().multiplyScalar(dragConstant*this.velocity.length()));
  // Update velocity
  this.velocity.add(this.accel.multiplyScalar(deltaTime));
  // Update position
  this.sphere.position.add(this.velocity.clone().multiplyScalar(deltaTime));
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
  this.lineMesh = new THREE.Line(this.lineGeo, this.lineMaterial);
  scene.add(this.lineMesh);
}

Edge.prototype.lineMaterial = new THREE.LineBasicMaterial({color: 0xFFFFFF});
Edge.prototype.update = function() {
  this.lineGeo.verticesNeedUpdate = true;
}
Edge.prototype.remove = function() {
  scene.remove(this.lineMesh);
}

var timeOfLastFrame = 0;

function update()
{
  var currentTime = new Date().getTime();
  var deltaTime = (currentTime - timeOfLastFrame)/1000;
  timeOfLastFrame = currentTime;

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

initializeScene();
buildGraph();
timeOfLastFrame = new Date().getTime();
update();
setInterval(mainLoop, 1000/60);



