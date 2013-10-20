"use strict";

define(function() {

  /*
   * Setting localFetch to true will result in Twitter data being loaded
   * from the working directory rather than the server.
   */
  var localFetch = true;

  if (localFetch) {
    var fetchByIDUrl = "";
    var fetchByScreenNameUrl = "";
  }
  else {
    var fetchByIDUrl = "http://fit-stu15-v01.infotech.monash.edu.au/~tjon14/fetching/fetch-user-only.php?id=";
    var fetchByScreenNameUrl = "http://fit-stu15-v01.infotech.monash.edu.au/~tjon14/fetching/fetch-user-only.php?screen_name=";
  }

  /*
   * Fetch a single profile using the provided ID.
   */
  function fetchProfileByID(id, profileFetched) {
    $.get(fetchByIDUrl + id, function(data) {
      var user = JSON.parse(data);
      if (user === null) {
        profileFetched(null);
      }
      else {
        var profile = JSON.parse(user.profile);
        profile.followers = user.followers;
        profile.friends = user.friends;
        profileFetched(profile);
      }
    });
  }

  /*
   * Fetch a single profile using the provided screen name.
   */
  function fetchProfileByScreenName(screenName, profileFetched) {
    $.get(fetchByScreenNameUrl + screenName, function(data) {
      var user = JSON.parse(data);
      if (user === null) {
        profileFetched(null);
      }
      else {
        var profile = JSON.parse(user.profile);
        profile.followers = user.followers;
        profile.friends = user.friends;
        profileFetched(profile);
      }
    });
  }

  /*
   * Create a new node using the provided screen name to load their profile.
   * This function should be called to get the root user for the graph.
   */
  Node.newNodeLoadedFromScreenName = function(screenName, profileLoaded) {
    var profile = fetchProfileByScreenName(screenName, function(profile) {
      if (profile) {
        var node = new Node(profile.id);
        node.profile = profile;
        node.profileLoadAttempted = true;
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

  // Graph physics variables
  var springRestLength = 10;
  var springK = 10;
  var repulsionStrength = 2000;
  var dragConstant = 0.2; // Drag forces
  var pointerDragForce = 20; // Force with which nodes are dragged by the user
  var maxPointerDragAccel = 8000;
  var stabilisingForce = 50; // Constant force applied to all nodes to stop slow movements
  var maxForceMag = 500; // The maximum net force that will be applied to a node in a frame
  var maxPhysicsTimeStep = 1/50; // The maxmimum about of time a single step of simulation can be

  // Variables for node models
  var sphereRadius = 0.5;
  var sphereSegments = 16;
  var sphereRings = 16;
  var sphereGeometry = new THREE.SphereGeometry(sphereRadius, sphereSegments, sphereRings);

  var dpScale = 0.82; // The size of the display pic with respect to the size of the border
  var dpOutlineScale = 0.86;
  var dpBorderScale = 0.96;
  var dpGeometry = new THREE.PlaneGeometry(dpScale, dpScale, 1, 1);
  var dpOutlineGeometry = new THREE.PlaneGeometry(dpOutlineScale, dpOutlineScale, 1, 1);
  var dpBorderGeometry = new THREE.PlaneGeometry(dpBorderScale, dpBorderScale, 1, 1);
  var dpBorderOutlineGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);

  var sphereMat = new THREE.MeshLambertMaterial({color: 0x888888});
  var highlightedSphereMat = new THREE.MeshLambertMaterial({color: 0xFF8800});
  var selectedSphereMat = new THREE.MeshLambertMaterial({color: 0x77FF77});

  var dpOutlineMat = new THREE.MeshBasicMaterial({color: 0x000000});
  var dpBorderMat = new THREE.MeshBasicMaterial({color: 0x666666});
  var highlightedDPBorderMat = new THREE.MeshBasicMaterial({color: 0xFF8800});
  var selectedDPBorderMat = new THREE.MeshBasicMaterial({color: 0x77FF77});

  var defaultDisplayPicTexture = THREE.ImageUtils.loadTexture("defaultProfilePic.png");

  // Colourings for edges
  var followerColor = 0x5555FF;
  var friendColor = 0xFF2222;
  var followerColorHighlighted = 0xFF00FF;
  var friendColorHighlighted = 0xFFFF44;

  // Limits to the number of followers/friends shown per node
  var followersPerNodeShownCap = 20;
  var friendsPerNodeShownCap = 20;

  /*
   * Constructor for the nodes of the graph. Initializes a node with all required attributes.
   */
  function Node(id) {
    if (Node.nodes[id]) return false;
    Node.nodes[id] = this;

    this.id = id; // Unique identifier for the node (originated from Twitter)

    this.profile = null;
    this.profileLoadAttempted = false; // Flag to only try loading a profile once
    this.profileLoaded = false;
    this.showNodeCount = 0; // The net number of requests to display the node
    this.showProfileCount = 0; // The net number of requests to show the node's profile
    this.highlighted = false;
    this.selected = false;
    this.grabbed = false;
    this.visible = false;

    // The base object which controls the position of the node and to which all other objects are attached
    this.object = new THREE.Object3D();
    this.sphereMesh = new THREE.Mesh(sphereGeometry, sphereMat);
    this.sphereMesh.node = this;
    this.object.add(this.sphereMesh);

    this.dpMaterial = new THREE.MeshBasicMaterial({map: defaultDisplayPicTexture});
    this.dpMesh = new THREE.Mesh(dpGeometry, this.dpMaterial);
    this.dpOutlineMesh = new THREE.Mesh(dpOutlineGeometry, dpOutlineMat);
    this.dpOutlineMesh.position.set(0, 0, -0.005);
    this.dpMesh.add(this.dpOutlineMesh);
    this.dpBorderMesh = new THREE.Mesh(dpBorderGeometry, dpBorderMat);
    this.dpBorderMesh.position.set(0, 0, -0.01);
    this.dpMesh.add(this.dpBorderMesh);
    this.dpBorderOutlineMesh = new THREE.Mesh(dpBorderOutlineGeometry, dpOutlineMat);
    this.dpBorderOutlineMesh.position.set(0, 0, -0.015);
    this.dpBorderOutlineMesh.node = this;
    this.dpMesh.add(this.dpBorderOutlineMesh);

    this.textBubble = new TextBubble(this.id);

    // Associative array to store references to edge objects
    this.edgesToFollowers = {};
    this.edgesToFriends = {};
    this.followerEdgesConstructed = 0;
    this.friendEdgesConstructed = 0;

    this.numShownFollowerNodes = 0;
    this.numShownFriendNodes = 0;
    this.numShownFollowerProfiles = 0;
    this.numShownFriendProfiles = 0;

    this.position = this.object.position;
    this.position.set(0, 0, -10);
    this.velocity = new THREE.Vector3();
    this.accel = new THREE.Vector3();
    this.springForces = {}; // Associative array to store spring forces during force calculations
    this.accruedTime = 0;
  }

  Node.nodes = {}; // Dictionary of created nodes
  Node.shownNodes = {}; // Dictionary of shown nodes

  Node.get = function(id) {
    return Node.nodes[id];
  }

  /*
   * This function is called when a node is to be shown. We don't want to see the node
   * unless more than one show call has been made, since we're not interested in displaying
   * nodes with only one neighbour and without profiles. A second show call will be made
   * if a second node is interested in this node or if the node's profile has been asked
   * to display.
   */
  Node.prototype.showNode = function() {
    ++this.showNodeCount;
    if (this.showNodeCount === 2) {
      scene.add(this.object);
      this.visible = true;
      Node.shownNodes[this.id] = this;
    }
  }

  Node.prototype.hideNode = function() {
    if (this.showNodeCount === 0) return;
    if (--this.showNodeCount === 1) {
      scene.remove(this.object);
      this.visible = false;
      Node.shownNodes[this.id] = undefined;
    }
  }

  /*
   * Adjust this node's appearance so that it displays the user's name and profile image.
   */
  Node.prototype.setToShowProfileAppearance = function() {
    // If the profile hasn't been loaded before, we're not testing locally,
    // and the profile image URL exists, fetch the profile image
    if (!this.profileLoaded && !localFetch && this.profile.profile_image_url) {
      this.dpMaterial.map = THREE.ImageUtils.loadTexture(this.profile.profile_image_url);
      this.dpMaterial.needsUpdate = true;
    }
    this.object.remove(this.sphereMesh);
    this.object.add(this.dpMesh);
    this.textBubble.redraw(this.profile.name);
  }

  /*
   * Hide this node's profile image and return it to the sphere appearance.
   */
  Node.prototype.setToHideProfileAppearance = function() {
    this.object.remove(this.dpMesh);
    this.object.add(this.sphereMesh);
  }

  /*
   * Show the profile information for this node. This can be requested multiple times.
   * The profile information is first loaded if necessary. A count is maintained so
   * that the profile remains shown until all the nodes that asked for it to be shown
   * ask for it to be hidden again.
   */
  Node.prototype.showProfile = function(followerCount, friendCount) {
    ++this.showProfileCount;
    this.showNode();
    if (this.showProfileCount === 1) {
      // If we've tried to load the profile before, don't try again
      if (this.profileLoadAttempted) {
        if (this.profileLoaded)
          this.setToShowProfileAppearance();
        this.showNeighbours(followerCount, friendCount);
      }
      else {
        // Fetch the profile and then show it
        this.willBeShown = true;
        var me = this;
        fetchProfileByID(this.id, function(profile) {
          me.profileLoadAttempted = true;
          if (profile) {
            me.profile = profile;
            // Before showing the profile, ensure that something didn't request the
            // profile to be hidden again in the meantime
            if (me.willBeShown) {
              me.setToShowProfileAppearance();
              me.showNeighbours(followerCount, friendCount);
              me.willBeShown = false;
            }
            me.profileLoaded = true;
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

  // If the follower count is invalid, or greater than the cap, adjust it.
  Node.prototype.checkFollowerCount = function(followerCount) {
    if (followersPerNodeShownCap > 0 && followersPerNodeShownCap < this.profile.followers.length) {
      // This also handles the case where followerCount is undefined
      if (!(followerCount >= 0) || followerCount > followersPerNodeShownCap)
        return followersPerNodeShownCap;
      else
        return followerCount;
    }
    else {
      if (!(followerCount >= 0) || followerCount > this.profile.followers.length)
        return this.profile.followers.length;
      else
        return followerCount;
    }
  }

  // If the friend count is invalid, or greater than the cap, adjust it.
  Node.prototype.checkFriendCount = function(friendCount) {
    if (friendsPerNodeShownCap > 0 && friendsPerNodeShownCap < this.profile.friends.length) {
      // This also handles the case where friendCount is undefined
      if (!(friendCount >= 0) || friendCount > friendsPerNodeShownCap)
        return friendsPerNodeShownCap;
      else
        return friendCount;
    }
    else {
      if (!(friendCount >= 0) || friendCount > this.profile.friends.length)
        return this.profile.friends.length;
      else
        return friendCount;
    }

  }

  /*
   * Show all the neighbours of this node. This won't show the profiles of the neighbours,
   * so it shouldn't be called outside of this module. Use showNeighbourProfiles for that.
   */
  Node.prototype.showNeighbours = function(followerCount, friendCount) {
    this.showNeighboursCheckedArgs(this.checkFollowerCount(followerCount), this.checkFriendCount(friendCount));
    // Call the select function again to ensure new edges are highlighted
    if (this.selected)
      this.select();
  }

  Node.prototype.showNeighboursCheckedArgs = function(followerCount, friendCount) {
    // Keep track of the nodes that will be newly appearing on the graph.
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

    for (var i = this.numShownFriendNodes; i < friendCount; ++i) {
      var id = this.profile.friends[i];
      var node = Node.get(id);
      if (!node)
        node = new Node(id);
      node.showNode();
      // If node is now visible
      if (node.showNodeCount === 2)
        appearingNodes.push(node);
    }

    positionAppearingNodes(appearingNodes, this.position);
    this.constructEdges(followerCount, friendCount);
    this.numShownFollowerNodes = followerCount;
    this.numShownFriendNodes = friendCount;
    this.profileIsShown = true;
  }

  /*
   * Hide all the neighbours of this node.
   */
  Node.prototype.hideNeighbours = function() {
    for (var i = 0; i < this.numShownFollowerNodes; ++i)
      Node.get(this.profile.followers[i]).hideNode();

    for (var i = 0; i < this.numShownFriendNodes; ++i)
      Node.get(this.profile.friends[i]).hideNode();

    this.numShownFollowerNodes = 0;
    this.numShownFriendNodes = 0;
  }

  /*
   * Show the profiles of all this node's neighbours, displaying the neighbour
   * nodes first if need be.
   */
  Node.prototype.showNeighbourProfiles = function(followerCount, friendCount) {
    if (!this.profileLoaded || this.showProfileCount === 0) return;

	//USE BATCH FETCH PHP SCRIPT HERE

    followerCount = this.checkFollowerCount(followerCount);
    friendCount = this.checkFriendCount(friendCount);

    // Ensure that the nodes are shown before we show their profiles
    this.showNeighboursCheckedArgs.call(this, followerCount, friendCount);

    // Keep track of the nodes that will be newly appearing on the graph.
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

    for (var i = this.numShownFriendProfiles; i < friendCount; ++i) {
      var id = this.profile.friends[i];
      var node = Node.get(id);
      // Node is about to be shown
      if (node.showNodeCount === 1) {
        appearingNodes.push(node);
      }
      node.showProfile();
    }

    positionAppearingNodes(appearingNodes, this.position);
    this.numShownFollowerProfiles = followerCount;
    this.numShownFriendProfiles = friendCount;

    // Call the select function again to ensure new edges are highlighted
    if (this.selected && appearingNodes.length > 0)
      this.select();
  }

  // May not need implementation // Node.prototype.hideNeighbourProfiles = function() {}

  /*
   * Position the provided nodes equally around the provided position.
   */
  function positionAppearingNodes(appearingNodes, centrePosition) {
    // Space the new nodes to be shown around this node
    var n = appearingNodes.length;
    var dlong = Math.PI*(3-Math.sqrt(5));
    var dz = 2.0/n;
    var long = 0;
    var z = 1 - dz/2;
    for (var k = 0; k < n; ++k) {
      var r = Math.sqrt(1-z*z);
      var pos = appearingNodes[k].position;
      pos.copy(centrePosition);
      pos.x += Math.cos(long)*r;
      pos.y += Math.sin(long)*r;
      pos.z += z;
      z = z - dz;
      long = long + dlong;
    }
  }

  /*
   * Construct the edge objects for the specified number of followers and friends.
   */
  Node.prototype.constructEdges = function(followerCount, friendCount) {
    var followers = this.profile.followers;
    var friends = this.profile.friends;
    // For all new shown follower nodes (where the edge isn't already constructed)
    for (var i = this.followerEdgesConstructed; i < followerCount; ++i) {
      var followerID = followers[i];
      var followerNode = Node.get(followerID);

      // If we already built the friend edge, update the existing edge
      if (this.edgesToFriends[followerID]) {
        this.edgesToFollowers[followerID] = this.edgesToFriends[followerID];
        this.edgesToFollowers[followerID].colorForDoubleFollower();
        continue;
      }

      if (followerNode.profileLoaded) {
        // If the follower node already has a friend edge connected to us, keep the existing edge
        if (followerNode.edgesToFriends[this.id]) {
          this.edgesToFollowers[followerID] = followerNode.edgesToFriends[this.id];
          continue ;
        }

        // If the follower node already has a follower edge connected to us, update the existing edge
        // to reflect that they are also following us
        if (followerNode.edgesToFollowers[this.id]) {
          this.edgesToFollowers[followerID] = followerNode.edgesToFollowers[this.id];
          this.edgesToFollowers[followerID].colorForDoubleFollower();
          continue;
        }
      }
      // Create a new edge
      var edge = new Edge(followerNode, this);
      this.edgesToFollowers[followerID] = edge;
      followerNode.edgesToFriends[this.id] = edge;
    }
    this.followerEdgesConstructed = followerCount;

    // Repeat for new shown friends node
    for (var i = this.friendEdgesConstructed; i < friendCount; ++i) {
      var friendID = friends[i];
      var friendNode = Node.get(friendID);

      // If we already built the follower edge, update the existing edge
      if (this.edgesToFollowers[friendID]) {
        this.edgesToFriends[friendID] = this.edgesToFollowers[friendID];
        this.edgesToFriends[friendID].colorForDoubleFollower();
        continue;
      }

      if (friendNode.profileLoaded) {
        // If the friend node already has a follower edge connected to us, keep the existing edge
        if (friendNode.edgesToFollowers[this.id]) {
          this.edgesToFriends[friendID] = friendNode.edgesToFollowers[this.id];
          continue;
        }
        // If the friend node already has a friend edge connected to us, update the existing edge
        // to reflect that we are also a friend of them
        var theirFriends = friendNode.profile.friends;
        if (friendNode.edgesToFriends[this.id]) {
          this.edgesToFriends[friendID] = friendNode.edgesToFriends[this.id];
          this.edgesToFriends[friendID].colorForDoubleFollower();
          continue;
        }
      }
      // Create a new edge
      var edge = new Edge(this, friendNode);
      this.edgesToFriends[friendID] = edge;
      friendNode.edgesToFollowers[this.id] = edge;
    }
    this.friendEdgesConstructed = friendCount;
  }

  /*
   * This function allows a node to keep track of how much time has passed since its last
   * physics update.
   */
  Node.prototype.addTime = function(deltaTime) {
    this.accruedTime += deltaTime;
  }

  /*
   * Calculate all the forces applied to this node, as well as the forces this node applies
   * to its neighbours. The position of the node is not updated in this method.
   */
  Node.prototype.calculateForces = function() {
    if (this.profileLoaded) {
      // Add spring forces between connected nodes

      for (var i = 0; i < this.numShownFollowerNodes; ++i) {
        var follower = Node.get(this.profile.followers[i]);
        // If the spring forces haven't already been added by the other node
        if (!this.springForces[follower.id]) {
          var displacement = (new THREE.Vector3()).subVectors(follower.position, this.position);
          var length = displacement.length();
          if (length > 0) {
            var stretch = length-springRestLength;
            var accel = displacement.multiplyScalar(springK*stretch*Math.log(stretch > 0 ? stretch : -stretch)/length);
            if (!this.pinned)
              this.springForces[follower.id] = accel;
            if (!follower.pinned)
              follower.springForces[this.id] = accel.clone().multiplyScalar(-1);
          }
        }
      }

      for (var i = 0; i < this.numShownFriendNodes; ++i) {
        var following = Node.get(this.profile.friends[i]);
        // If the spring forces haven't already been added by the other node
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

      // Displacement of the pointer from the node
      var displacement = pointerPos.sub(this.position);
      // Force is proportional to square distance and drag force
      var newAccel = displacement.multiplyScalar(displacement.length() * pointerDragForce);
      var mag = newAccel.length();
      // Limit the maximum drag force
      if (mag > maxPointerDragAccel)
        newAccel.multiplyScalar(maxPointerDragAccel / mag);
      this.accel.add(newAccel);
    }

    // Set the materials of the node's meshes to reflect its current state
    if (this.profileLoaded && this.showProfileCount) {
      if (this.selected) {
        this.dpBorderMesh.material = selectedDPBorderMat;
      }
      else if (this.highlighted) {
        this.dpBorderMesh.material = highlightedDPBorderMat;
      }
      else {
        this.dpBorderMesh.material = dpBorderMat;
      }
    }
    else {
      if (this.selected) {
        this.sphereMesh.material = selectedSphereMat;
      }
      else if (this.highlighted) {
        this.sphereMesh.material = highlightedSphereMat;
      }
      else {
        this.sphereMesh.material = sphereMat;
      }
    }
  }

  /*
   * Update the position of the node using the forces calculated in the
   * calculateForces method.
   */
  Node.prototype.applyForces = function(camera) {
    if (this.accruedTime > maxPhysicsTimeStep)
      this.accruedTime = maxPhysicsTimeStep;

    // We don't move selected nodes. They become the centre of focus.
    if (!this.selected) {
      // Add spring forces
      for (var id in this.springForces) {
        this.accel.add(this.springForces[id]);
      }

      // Add drag force
      this.accel.sub(this.velocity.clone().multiplyScalar(dragConstant*this.velocity.length()));
      // Limit maximum force
      var forceMag = this.accel.length();
      if (forceMag === NaN) {
        this.accel.set(0, 0, 0);
        console.log("Encountered a NaN accel value for node with ID " + this.id);
      }
      else if (forceMag > maxForceMag) {
        this.accel.multiplyScalar(maxForceMag/forceMag);
      }
      // Update velocity
      this.velocity.add(this.accel.multiplyScalar(this.accruedTime));

      // Round to zero for very small velocities to stop slow drifting when node is not being dragged
      if (this.grabbed) {
        this.position.add(this.velocity.clone().multiplyScalar(this.accruedTime));
      }
      else {
        // Apply stabilising force (to help stop prolonged, slow movement of nodes)
        var vmag = this.velocity.length();
        var vdir = this.velocity.clone().divideScalar(vmag);
        var negatedVelocity = this.accruedTime*stabilisingForce;
        if (vmag > negatedVelocity) {
          vmag -= negatedVelocity;
          // Update position
          this.position.add(vdir.multiplyScalar(this.accruedTime*vmag));
        }
        else this.velocity.set(0, 0, 0);
      }
    }

    // Reset forces
    this.springForces = {};
    this.accel.set(0, 0, 0);
    this.accruedTime = 0;
  }

  Node.prototype.updateComponents = function(deltaTime) {
    if (!this.selected) {
      // Update edges
      for (var ID in this.edgesToFollowers)
        this.edgesToFollowers[ID].update();
      for (var ID in this.edgesToFriends)
        this.edgesToFriends[ID].update();
    }

    // Update text bubble
    if (this.textBubble.visible) {
      this.textBubble.scaleForDistance(zDistanceToCamera(this.position));
    }

    // Orient the DP
    var q = this.object.quaternion;
    q.copy(camera.quaternion);
    q.x *= -1;
    q.y *= -1;
    q.z *= -1;
    q.w *= -1;
  }

  Node.prototype.highlight = function() {
    this.highlighted = true;
    if (this.profileLoaded && !this.textBubble.visible) {
      this.textBubble.redraw();
      this.object.add(this.textBubble.mesh);
      this.textBubble.visible = true;
    }
  }

  Node.prototype.unhighlight = function() {
    this.highlighted = false;
    if(!this.selected && this.textBubble.visible) {
      this.object.remove(this.textBubble.mesh);
      this.textBubble.visible = false;
    }
  }

  Node.prototype.select = function() {
    this.selected = true;
    if (this.profileLoaded && !this.textBubble.visible) {
      this.textBubble.redraw();
      this.object.add(this.textBubble.mesh);
      this.textBubble.visible = true;
    }
    for (var ID in this.edgesToFollowers)
      this.edgesToFollowers[ID].highlight();
    for (var ID in this.edgesToFriends)
      this.edgesToFriends[ID].highlight();
  }

  Node.prototype.deselect = function() {
    this.selected = false;
    if (!this.highlighted && this.textBubble.visible) {
      this.object.remove(this.textBubble.mesh);
      this.textBubble.visible = false;
    }
    for (var ID in this.edgesToFollowers)
      this.edgesToFollowers[ID].unhighlight();
    for (var ID in this.edgesToFriends)
      this.edgesToFriends[ID].unhighlight();
  }

  Node.prototype.grab = function() {
    this.grabbed = true;
  }

  Node.prototype.releaseGrab = function() {
    this.grabbed = false;
  }

  var lineMaterial = new THREE.LineBasicMaterial(
    {color: 0xFFFFFF, vertexColors: THREE.VertexColors}
  );

  /*
   * The Edge object visually depicts a relationship between two nodes.
   */
  function Edge(follower, followee)
  {
    this.followerNode = follower;
    this.followeeNode = followee;

    this.lineGeo = new THREE.Geometry();
    this.lineGeo.dynamic = true;
    this.lineGeo.vertices.push(this.followerNode.position);
    this.lineGeo.vertices.push(this.followeeNode.position);
    this.lineGeo.colors.push(new THREE.Color(followerColor));
    this.lineGeo.colors.push(new THREE.Color(friendColor));
    this.mesh = new THREE.Line(this.lineGeo, lineMaterial);
    this.visible = false;
    this.doubleFollower = false;
  }

  /*
   * Determine whether the edge should currently be visible and
   * force an update of the vertex positions of the edge.
   */
  Edge.prototype.update = function() {
    if (this.visible) {
      if (!this.followerNode.visible || !this.followeeNode.visible) {
        scene.remove(this.mesh);
        this.visible = false;
      }
      else this.lineGeo.verticesNeedUpdate = true;
    }
    else {
      if (this.followerNode.visible && this.followeeNode.visible) {
        scene.add(this.mesh);
        this.visible = true;
        this.lineGeo.verticesNeedUpdate = true;
      }
    }
  }

  /*
   * Alter the colours of the edge to reflect the double following
   * relationship.
   */
  Edge.prototype.colorForDoubleFollower = function() {
    this.lineGeo.colors[0].setHex(friendColor);
    this.lineGeo.colorsNeedUpdate = true;
    this.doubleFollower = true;
  }

  Edge.prototype.highlight = function() {
    this.lineGeo.colors[1].setHex(friendColorHighlighted);
    if (this.doubleFollower)
      this.lineGeo.colors[0].setHex(friendColorHighlighted);
    else
      this.lineGeo.colors[0].setHex(followerColorHighlighted);
    this.lineGeo.colorsNeedUpdate = true;
  }

  Edge.prototype.unhighlight = function() {
    this.lineGeo.colors[1].setHex(friendColor);
    if (this.doubleFollower)
      this.lineGeo.colors[0].setHex(friendColor);
    else
      this.lineGeo.colors[0].setHex(followerColor);
    this.lineGeo.colorsNeedUpdate = true;
  }

  // Text bubble-related variables
  var textWidth = 480;
  var textHeight = 64;
  var textBubbleSize = 1/60;
  var textBubbleVerticalDisplacement = 0.7;

  /*
   * The TextBubble object displays a user's name on a label in 3D space.
   */
  function TextBubble(text)
  {
    this.visible = false;
    this.texture = new THREE.Texture(drawingCanvas);
    this.material = new THREE.MeshBasicMaterial({map: this.texture});
    this.material.transparent = false;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(textWidth/textHeight, 1),
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

  /*
   * Scale the text bubble such that it is always the same size on the screen
   * irrespective of it's distance from the camera. The camera distance should
   * be provided as an argument to this function.
   */
  TextBubble.prototype.scaleForDistance = function(distance) {
    var scale = distance*textBubbleSize;
    this.mesh.scale.set(scale, scale, scale);
    this.mesh.position.set(0, 0.5*dpScale+scale/2, 0.01);
  }

  return Node;
});















