"use strict";

define(function() {

  // Variables for node models
  var sphereRadius = 1;
  var sphereSegments = 16;
  var sphereRings = 16;

  var standardMat = new THREE.MeshLambertMaterial({color: 0xE0FFFF, opacity: 0.3, transparent: true});
  var highlightedMat = new THREE.MeshLambertMaterial({color: 0xFF8800, opacity: 0.3, transparent: true});
  var selectedMat = new THREE.MeshLambertMaterial({color: 0x77FF77, opacity: 0.3, transparent: true});
  var catFaceTexture = THREE.ImageUtils.loadTexture("cat-face-grey.jpg");
  var catFaceMaterial = new THREE.MeshBasicMaterial({map: catFaceTexture});


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
      User.standardSphereMat
    );

    this.sphere.user = name;
    this.sphere.position.set((Math.random()-0.5)*25, (Math.random()-0.5)*25, (Math.random()-0.5)*25-10);
    scene.add(this.sphere);
    this.velocity = new THREE.Vector3();
    this.accel = new THREE.Vector3();

    this.followers = new Array();
    this.followerEdges = new Array();

    this.catPicMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3, 1, 1), catFaceMaterial);
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
    if (this.grabbed) {
      // Set the pointer depth in 3D to the node depth (in NDC)
      var nodePos = projector.projectVector(this.sphere.position.clone(), camera);
      var pointerPos = new THREE.Vector3(Input.currentPointer.x, Input.currentPointer.y, nodePos.z);
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

    if (this.selected) {
      this.sphere.material = selectedMat;
    }
    else if (this.highlighted) {
      this.sphere.material = highlightedMat;
    }
    else {
      this.sphere.material = standardMat;
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

  return User;

});






