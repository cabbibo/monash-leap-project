"use strict";

define(function() {

  var localFetch = false;

  if (localFetch) {
    var fetchByIDUrl = "";
    var fetchByScreenNameUrl = "";
  }
  else {
    var fetchByIDUrl = "http://fit-stu15-v01.infotech.monash.edu.au/~tjon14/fetch-user-only.php?id=";
    var fetchByScreenNameUrl = "http://fit-stu15-v01.infotech.monash.edu.au/~tjon14/fetch-user-only.php?screen_name=";
  }

  function fetchProfileByID(id, profileFetched) {
    $.get(fetchByIDUrl + id, function(data) {
      var user = JSON.parse(data);
      if (user === null) {
        profileFetched(null);
      }
      else {
        var profile = JSON.parse(user.profile);
        profile.followers = user.followers;
        profile.following = user.friends;
        profileFetched(profile);
      }
    });
  }

  function fetchProfileByScreenName(screenName, profileFetched) {
    $.get(fetchByScreenNameUrl + screenName, function(data) {
      var user = JSON.parse(data);
      if (user === null) {
        profileFetched(null);
      }
      else {
        var profile = JSON.parse(user.profile);
        profile.followers = user.followers;
        profile.following = user.friends;
        profileFetched(profile);
      }
    });
  }

  Node.newNodeLoadedFromScreenName = function(screenName, profileLoaded) {
    var profile = fetchProfileByScreenName(screenName, function(profile) {
      if (profile) {
        var node = new Node(profile.id);
        node.profile = profile;
        node.profileLoaded = true;
        node.setToShowProfileAppearance();
        profileLoaded(node);
      }
      else {
        console.log("Failed to load profile for user with screen name '" + screenName + "'.");
        profileLoaded(null);
      }
    });
  }

  Node.newNodes = new Array();

  // Graph physics variables
  var springRestLength = 10;
  var springK = 10;
  var repulsionStrength = 800;
  var dragConstant = 0.2;
  var pointerDragForce = 20;
  var maxPointerDragAccel = 8000;
  var stabilisingForce = 50; // Constant force applied to all nodes to stop slow movements

  // Variables for node models
  var sphereRadius = 0.5;
  var sphereSegments = 16;
  var sphereRings = 16;

  var nodeGeometry = new THREE.SphereGeometry(sphereRadius, sphereSegments, sphereRings);
  var nodeMatU = new THREE.MeshLambertMaterial({color: 0x888888});
  var nodeMatL = new THREE.MeshLambertMaterial({color: 0xE0FFFF, opacity: 0.3, transparent: true});
  var highlightedNodeMatU = new THREE.MeshLambertMaterial({color: 0xFF8800});
  var selectedNodeMatU = new THREE.MeshLambertMaterial({color: 0x77FF77});
  var highlightedNodeMatL = new THREE.MeshLambertMaterial({color: 0xFF8800, opacity: 0.3, transparent: true});
  var selectedNodeMatL = new THREE.MeshLambertMaterial({color: 0x77FF77, opacity: 0.3, transparent: true});
  var defaultDisplayPicTexture = THREE.ImageUtils.loadTexture("defaultProfilePic.png");

  var followerColor = 0x5555FF;
  var followeeColor = 0xFF2222;

  // Limits to the number of followers/following shown per node
  var followersPerNodeShownCap = 20;
  var followingPerNodeShownCap = 20;

  function Node(id) {
    if (Node.nodes[id] !== undefined) return false;
    Node.nodes[id] = this;

    this.id = id;

    this.profile = null;
    this.profileLoaded = false;
    this.showNodeCount = 0;
    this.showProfileCount = 0;
    this.highlighted = false;
    this.selected = false;
    this.grabbed = false;
    this.expanded = false;

    this.mesh = new THREE.Mesh(nodeGeometry, nodeMatU);
    this.meshInScene = false;
    this.mesh.node = this;
    this.displayPicMaterial = new THREE.MeshBasicMaterial({map: defaultDisplayPicTexture});
    this.displayPicMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65, 1, 1), this.displayPicMaterial);
    this.mesh.add(this.displayPicMesh);
    this.displayPicMesh.visible = false;

    this.textBubble = new TextBubble(this.id);
    this.displayPicMesh.add(this.textBubble.mesh);
    this.textBubble.mesh.position.set(0, textBubbleVerticalDisplacement, 0);
    this.textBubble.mesh.visible = false;

    this.edgesToFollowers = new Array();
    this.edgesToFollowing = new Array();
    this.numShownFollowerNodes = 0;
    this.numShownFollowingNodes = 0;
    this.numShownFollowerProfiles = 0;
    this.numShownFollowingProfiles = 0;
    this.followerEdgesConstructed = 0;
    this.followingEdgesConstructed = 0;

    this.position = this.mesh.position;
    this.position.set((Math.random()-0.5)*10, (Math.random()-0.5)*10, (Math.random()-0.5)*10-10);
    this.velocity = new THREE.Vector3();
    this.accel = new THREE.Vector3();
    this.springForces = {};
  }

  Node.nodes = {};
  Node.shownNodes = {};

  Node.get = function(id) {
    return Node.nodes[id];
  }

  // We don't want to see the node unless more than one show call has been made
  // A second show call will be made if a second node is interested in this node
  // or if the node's profile has been asked to be shown
  Node.prototype.showNode = function() {
    ++this.showNodeCount;
    if (this.showNodeCount === 2) {
      scene.add(this.mesh);
      this.meshInScene = true;
      Node.shownNodes[this.id] = this;
    }
  }

  Node.prototype.hideNode = function() {
    if (this.showNodeCount === 0) return;
    if (--this.showNodeCount === 1) {
      scene.remove(this.mesh);
      this.meshInScene = false;
      Node.shownNodes[this.id] = undefined;
    }
  }

  Node.prototype.setToShowProfileAppearance = function() {
    this.mesh.scale.set(2, 2, 2);
    /* CROSS-ORIGIN ISSUES
    if (this.profile.profile_image_url) {
      this.displayPicMaterial.map = THREE.ImageUtils.loadTexture(this.profile.profile_image_url);
      this.displayPicMaterial.needsUpdate = true;
    }
    */
    this.displayPicMesh.visible = true;
    this.textBubble.redraw(this.profile.screen_name);
  }

  Node.prototype.setToHideProfileAppearance = function() {
    this.mesh.scale.set(1, 1, 1);
    this.displayPicMesh.visible = false;
  }

  Node.prototype.showProfile = function(followerCount, followingCount) {
    ++this.showProfileCount;
    if (this.showProfileCount === 1) {

      if (this.profileLoaded) {
        this.showNode(); // Guarantee a second show so the node is visible
        showNeighbours.call(this, followerCount, followingCount);
      }
      else {
        // Fetch the profile and then show it
        this.willBeShown = true;
        var me = this;
        fetchProfileByID(this.id, function(profile) {
          if (profile) {
            me.showNode(); // Guarantee a second show so the node is visible
            me.profile = profile;
            me.profileLoaded = true;
            // Before showing the profile, ensure that something didn't request the profile to be hidden again in the meantime
            if (me.willBeShown) {
              me.setToShowProfileAppearance();
              showNeighbours.call(me, followerCount, followingCount);
              me.willBeShown = false;
            }
          }
          else {
            console.log("Failed to load profile for user with ID " + me.id + ".");
          }
        });
      }
    }
  }

  Node.prototype.hideProfile = function() {
    if (this.showProfileCount === 0) return;
    this.hideNode();
    if (--this.showProfileCount === 0) {
      if (this.willBeShown) {
        // Cancel a show request that is yet to be fulfilled
        this.willBeShown = false;
      }
      else {
        this.setToHideProfileAppearance();
        hideNeighbours.call(this);
      }
    }
  }

  // The next two methods are not added to the prototype to ensure we never try to call
  // them from outside this module. They should be private.

  function showNeighbours(followerCount, followingCount) {
    if (followersPerNodeShownCap > 0 && followersPerNodeShownCap < this.profile.followers.length) {
      if (!(followerCount >= 0) || followerCount > followersPerNodeShownCap)
        followerCount = followersPerNodeShownCap;
    }
    else {
      if (!(followerCount >= 0) || followerCount > this.profile.followers.length)
        followerCount = this.profile.followers.length;
    }

    if (followingPerNodeShownCap > 0 && followingPerNodeShownCap < this.profile.following.length) {
      if (!(followingCount >= 0) || followingCount > followingPerNodeShownCap)
        followingCount = followingPerNodeShownCap;
    }
    else {
      if (!(followingCount >= 0) || followingCount > this.profile.following.length)
        followingCount = this.profile.following.length;
    }

    var appearingNodes = new Array();

    // Show the specified number of followers if they are not already shown, creating their nodes if they do not exist
    for (var i = this.numShownFollowerNodes; i < followerCount; ++i) {
      var id = this.profile.followers[i];
      var node = Node.get(id);
      if (!node)
        node = new Node(id);
      node.showNode();
      // If node is now visible
      if (node.showNodeCount === 2)
        appearingNodes.push(node);
    }

    for (var i = this.numShownFollowingNodes; i < followingCount; ++i) {
      var id = this.profile.following[i];
      var node = Node.get(id);
      if (!node)
        node = new Node(id);
      node.showNode();
      // If node is now visible
      if (node.showNodeCount === 2)
        appearingNodes.push(node);
    }

    // Space the new nodes to be shown around this node
    var n = appearingNodes.length;
    var dlong = Math.PI*(3-Math.sqrt(5));
    var dz = 2.0/n;
    var long = 0;
    var z = 1 - dz/2;
    for (var k = 0; k < n; ++k) {
      var r = Math.sqrt(1-z*z);
      var pos = appearingNodes[k].position;
      pos.copy(this.position);
      pos.x += Math.cos(long)*r;
      pos.y += Math.sin(long)*r;
      pos.z += z;
      z = z - dz;
      long = long + dlong;
    }

    this.constructEdges(followerCount, followingCount);

    this.numShownFollowerNodes = followerCount;
    this.numShownFollowingNodes = followingCount;
    this.profileIsShown = true;
  }

  function hideNeighbours() {
    for (var i = 0; i < this.numShownFollowerNodes; ++i)
      Node.get(this.profile.followers[i]).hideNode();

    for (var i = 0; i < this.numShownFollowingNodes; ++i)
      Node.get(this.profile.following[i]).hideNode();

    this.numShownFollowerNodes = 0;
    this.numShownFollowingNodes = 0;
  }

  Node.prototype.showNeighbourProfiles = function(followerCount, followingCount) {
    if (!this.profileLoaded || this.showProfileCount === 0) return;

    if (followersPerNodeShownCap > 0 && followersPerNodeShownCap < this.profile.followers.length) {
      if (!(followerCount >= 0) || followerCount > followersPerNodeShownCap)
        followerCount = followersPerNodeShownCap;
    }
    else {
      if (!(followerCount >= 0) || followerCount > this.profile.followers.length)
        followerCount = this.profile.followers.length;
    }

    if (followingPerNodeShownCap > 0 && followingPerNodeShownCap < this.profile.following.length) {
      if (!(followingCount >= 0) || followingCount > followingPerNodeShownCap)
        followingCount = followingPerNodeShownCap;
    }
    else {
      if (!(followingCount >= 0) || followingCount > this.profile.following.length)
        followingCount = this.profile.following.length;
    }

    // Ensure that the nodes are shown regularly before we show their profiles
    showNeighbours.call(this, followerCount, followingCount);

    var appearingNodes = new Array();

    // Show the specified number of followers, creating their nodes if they do not exist
    for (var i = this.numShownFollowerProfiles; i < followerCount; ++i) {
      var id = this.profile.followers[i];
      var node = Node.get(id);
      // Node is about to be shown
      if (node.showNodeCount === 1) {
        appearingNodes.push(node);
      }
      node.showProfile();
    }

    for (var i = this.numShownFollowingProfiles; i < followingCount; ++i) {
      var id = this.profile.following[i];
      var node = Node.get(id);
      // Node is about to be shown
      if (node.showNodeCount === 1) {
        appearingNodes.push(node);
      }
      node.showProfile();
    }

    // Space the new nodes to be shown around this node
    var n = appearingNodes.length;
    var dlong = Math.PI*(3-Math.sqrt(5));
    var dz = 2.0/n;
    var long = 0;
    var z = 1 - dz/2;
    for (var k = 0; k < n; ++k) {
      var r = Math.sqrt(1-z*z);
      var pos = appearingNodes[k].position;
      pos.copy(this.position);
      pos.x += Math.cos(long)*r;
      pos.y += Math.sin(long)*r;
      pos.z += z;
      z = z - dz;
      long = long + dlong;
    }

    this.numShownFollowerProfiles = followerCount;
    this.numShownFollowingProfiles = followingCount;
  }

  Node.prototype.hideNeighbourProfiles = function() {

  }

  Node.prototype.constructEdges = function(followerCount, followingCount) {
    var followers = this.profile.followers;
    var following = this.profile.following;
    // For all new shown follower nodes (where the edge isn't already constructed)
    NEXT_FOLLOWER: for (var i = this.followerEdgesConstructed; i < followerCount; ++i) {
      // If we already built the following edge, update the existing edge
      for (var j = 0; j < this.followingEdgesConstructed; ++j) {
        if (followers[i] === following[j]) {
          this.edgesToFollowers[i] = this.edgesToFollowing[j];
          this.edgesToFollowers[i].doubleFollower();
          continue;
        }
      }

      var followerNode = Node.get(followers[i]);

      if (followerNode.profileLoaded) {
        // If the follower node already has a following edge connected to us, keep the existing edge
        var theirFollowing = followerNode.profile.following;
        for (var j = 0; j < followerNode.followingEdgesConstructed; ++j) {
          if (theirFollowing[j] === this.id) {
            this.edgesToFollowers[i] = followerNode.edgesToFollowing[j];
            continue NEXT_FOLLOWER;
          }
        }

        // If the follower node already has a follower edge connected to us, update the existing edge
        // to reflect that they are also following us
        var theirFollowers = followerNode.profile.followers;
        for (var j = 0; j < followerNode.followerEdgesConstructed; ++j) {
          if (theirFollowers[j] === this.id) {
            this.edgesToFollowers[i] = followerNode.edgesToFollowers[j];
            this.edgesToFollowers[i].doubleFollower();
            continue NEXT_FOLLOWER;
          }
        }
      }
      // Create a new edge and store it in the same index that the follower node is in
      this.edgesToFollowers[i] = new Edge(followerNode, this);
    }
    this.followerEdgesConstructed = this.numShownFollowerNodes;

    // Repeat for new shown following node
    NEXT_FOLLOWING: for (var i = this.followingEdgesConstructed; i < followingCount; ++i) {
      // If we already built the follower edge, update the existing edge
      for (var j = 0; j < this.followerEdgesConstructed; ++j) {
        if (following[i] === followers[j]) {
          this.edgesToFollowing[i] = this.edgesToFollowers[j];
          this.edgesToFollowing[i].doubleFollower();
          continue;
        }
      }

      var followingNode = Node.get(following[i]);

      if (followingNode.profileLoaded) {
        // If the following node already has a follower edge connected to us, keep the existing edge
        var theirFollowers = followingNode.profile.followers;
        for (var j = 0; j < followingNode.followerEdgesConstructed; ++j) {
          if (theirFollowers[j] === this.id) {
            this.edgesToFollowing[i] = followingNode.edgesToFollowers[j];
            continue NEXT_FOLLOWING;
          }
        }
        // If the following node already has a following edge connected to us, update the existing edge
        // to reflect that we are also following them
        var theirFollowing = followingNode.profile.following;
        for (var j = 0; j < followingNode.followingEdgesConstructed; ++j) {
          if (theirFollowing[j] === this.id) {
            this.edgesToFollowing[i] = followingNode.edgesToFollowing[j];
            this.edgesToFollowing[i].doubleFollower();
            continue NEXT_FOLLOWING;
          }
        }
      }
      // Create a new edge and store it in the same index that the following node is in
      this.edgesToFollowing[i] = new Edge(this, followingNode);
    }
    this.followingEdgesConstructed = this.numShownFollowingNodes;
  }

  Node.prototype.calculateForces = function() {
    if (this.profileLoaded) {
      // Add spring springForces between connected nodes
      for (var i = 0; i < this.numShownFollowerNodes; ++i) {
        var follower = Node.get(this.profile.followers[i]);
        // If the springForces haven't already been added by the other node
        if (!this.springForces[follower.id]) {
          var displacement = (new THREE.Vector3()).subVectors(follower.position, this.position);
          var length = displacement.length();
          if (length > 0) {
            var accel = displacement.multiplyScalar(springK*(length-springRestLength)/length);
            if (!this.pinned)
              this.springForces[follower.id] = accel;
            if (!follower.pinned)
              follower.springForces[this.id] = accel.clone().multiplyScalar(-1);
          }
        }
      }

      for (var i = 0; i < this.numShownFollowingNodes; ++i) {
        var following = Node.get(this.profile.following[i]);
        // If the springForces haven't already been added by the other node
        if (!this.springForces[following.id]) {
          var displacement = (new THREE.Vector3()).subVectors(following.position, this.position);
          var length = displacement.length();
          if (length > 0) {
            var accel = displacement.multiplyScalar(springK*(length-springRestLength)/length);
            if (!this.pinned)
              this.springForces[following.id] = accel;
            if (!following.pinned)
              following.springForces[this.id] = accel.clone().multiplyScalar(-1);
          }
        }
      }
    }

    if (!this.pinned) {
      // Add forces from node proximity
      for (var id in Node.shownNodes) {
        var node = Node.get(id);
        if (node !== this) {
          var displacement = (new THREE.Vector3()).subVectors(node.position, this.position);
          var length = displacement.length();
          displacement.multiplyScalar(-repulsionStrength/length/length/length);
          this.accel.add(displacement);
        }
      }
    }

    // Add force from being dragged around via interaction
    if (this.grabbed) {
      // Set the pointer depth in 3D to the node depth (in NDC)
      var nodePos = projector.projectVector(this.position.clone(), camera);
      var pointerPos = new THREE.Vector3(Input.currentPointer.x, Input.currentPointer.y, nodePos.z);
      // Now in world space
      projector.unprojectVector(pointerPos, camera);

      // Displacement of the pointer pointer from the node
      var displacement = pointerPos.sub(this.position);
      // Force is proportional to square distance and drag force
      var newAccel = displacement.multiplyScalar(displacement.length() * pointerDragForce);
      var mag = newAccel.length();
      // Limit the maximum drag force
      if (mag > maxPointerDragAccel)
        newAccel.multiplyScalar(maxPointerDragAccel / mag);
      this.accel.add(newAccel);
    }

    if (this.selected) {
      this.mesh.material = this.showProfileCount ? selectedNodeMatL : selectedNodeMatU;
    }
    else if (this.highlighted) {
      this.mesh.material = this.showProfileCount ? highlightedNodeMatL : highlightedNodeMatU;
    }
    else {
      this.mesh.material = this.showProfileCount ? nodeMatL : nodeMatU;
    }
  }

  Node.prototype.updatePosition = function(deltaTime) {
    // We don't move selected nodes. They become the centre of focus.
    if (!this.selected) {
      // Add spring forces
      for (var id in this.springForces)
        this.accel.add(this.springForces[id]);
      // Add drag force
      this.accel.sub(this.velocity.clone().multiplyScalar(dragConstant*this.velocity.length()));
      // Update velocity
      this.velocity.add(this.accel.multiplyScalar(deltaTime));

      // Round to zero for very small velocities to stop slow drifting when node is not being dragged
      if (this.grabbed) {
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
      }
      else {
        var vmag = this.velocity.length();
        var vdir = this.velocity.clone().divideScalar(vmag);
        var negatedVelocity = deltaTime*stabilisingForce;
        if (vmag > negatedVelocity) {
          vmag -= negatedVelocity;
          // Update position
          this.position.add(vdir.multiplyScalar(deltaTime*vmag));
        }
        else this.velocity.set(0, 0, 0);
      }
    }

    // Reset forces
    this.springForces = {};
    this.accel.set(0, 0, 0);

    // Update edges
    for (var i = 0; i < this.numShownFollowerNodes; ++i)
      this.edgesToFollowers[i].update();
    for (var i = 0; i < this.numShownFollowingNodes; ++i)
      this.edgesToFollowing[i].update();
  }

  Node.prototype.orient = function(cameraQuaternion) {
    var q = this.displayPicMesh.quaternion;
    q.copy(cameraQuaternion);
    q.x *= -1;
    q.y *= -1;
    q.z *= -1;
    q.w *= -1;
  }

  Node.prototype.highlight = function() {
    this.highlighted = true;
    if (!this.selected) {
      this.textBubble.redraw();
      this.textBubble.mesh.visible = true;
    }
  }

  Node.prototype.unhighlight = function() {
    this.highlighted = false;
    if(!this.selected)
      this.textBubble.mesh.visible = false;
  }

  Node.prototype.select = function() {
    this.selected = true;
    if (!this.highlighted) {
      this.textBubble.redraw();
      this.textBubble.mesh.visible = true;
    }
  }

  Node.prototype.deselect = function() {
    this.selected = false;
    if (!this.highlighted)
      this.textBubble.mesh.visible = false;
  }

  Node.prototype.grab = function() {
    this.grabbed = true;
  }

  Node.prototype.releaseGrab = function() {
    this.grabbed = false;
  }

  function Edge(follower, followee)
  {
    this.followerNode = follower;
    this.followeeNode = followee;

    this.lineGeo = new THREE.Geometry();
    this.lineGeo.dynamic = true;
    this.lineGeo.vertices.push(this.followerNode.position);
    this.lineGeo.vertices.push(this.followeeNode.position);
    this.lineGeo.colors.push(new THREE.Color(followerColor));
    this.lineGeo.colors.push(new THREE.Color(followeeColor));
    this.mesh = new THREE.Line(this.lineGeo, this.lineMaterial);
    this.meshInScene = false;
  }

  Edge.prototype.lineMaterial = new THREE.LineBasicMaterial(
    {color: 0xFFFFFF, vertexColors: THREE.VertexColors}
  );

  Edge.prototype.update = function() {
    this.lineGeo.verticesNeedUpdate = true;
    if (this.meshInScene) {
      if (!this.followerNode.meshInScene || !this.followeeNode.meshInScene) {
        scene.remove(this.mesh);
        this.meshInScene = false;
      }
    }
    else {
      if (this.followerNode.meshInScene && this.followeeNode.meshInScene) {
        scene.add(this.mesh);
        this.meshInScene = true;
      }
    }
  }

  Edge.prototype.doubleFollower = function() {
    this.lineGeo.colors[0].setHex(followeeColor);
    this.lineGeo.colorsNeedUpdate = true;
  }

  /*
  The Text Bubble prototype which displays information about a user
  */

  var textWidth = 480;
  var textHeight = 64;
  var textBubbleScale = 0.5;
  var textBubbleVerticalDisplacement = 1.5;

  function TextBubble(text)
  {
    this.texture = new THREE.Texture(drawingCanvas);
    this.material = new THREE.MeshBasicMaterial({map: this.texture});
    this.material.transparent = false;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(textBubbleScale*(textWidth/textHeight), textBubbleScale),
      this.material
    );
    this.text = text;
  }

  TextBubble.prototype.redraw = function(text) {
    if (text)
      this.text = text;
    drawingCanvas.width = textWidth;
    drawingCanvas.height = textHeight;
    drawingContext.font = "Bold "+(textHeight-8)+"px Arial";
	  drawingContext.fillStyle = 'white';
    drawingContext.fillRect(0, 0, textWidth, textHeight);
    drawingContext.fillStyle = 'black';
    drawingContext.fillText(this.text, 8, textHeight-12);
    this.texture.needsUpdate = true;
  }

  return Node;
});




