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
        try {
          var profile = JSON.parse(user.profile);
        } catch (e) {
          console.log(e);
          profileFetched(null);
          return;
        }
        profile.followers = user.followers;
        profile.friends = user.friends;

        if (user.timeline) {
          try {
            profile.timeline = JSON.parse(user.timeline);
          }
          catch (e) {
            console.log(e);
            profile.timeline = [];
          }
        }
        else {
          profile.timeline = [];
        }

        if (user.favorites) {
          try {
            profile.favorites = JSON.parse(user.favorites);
          }
          catch (e) {
            console.log(e);
            profile.favorites = [];
          }
        }
        else {
          profile.favorites = [];
        }

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
        try {
          var profile = JSON.parse(user.profile);
        } catch (e) {
          console.log(e);
          profileFetched(null);
          return;
        }
        profile.followers = user.followers;
        profile.friends = user.friends;

        if (user.timeline) {
          try {
            profile.timeline = JSON.parse(user.timeline);
          }
          catch (e) {
            console.log(e);
            profile.timeline = [];
          }
        }
        else {
          profile.timeline = [];
        }

        if (user.favorites) {
          try {
            profile.favorites = JSON.parse(user.favorites);
          }
          catch (e) {
            console.log(e);
            profile.favorites = [];
          }
        }
        else {
          profile.favorites = [];
        }

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
        profileLoaded(node);
      }
      else {
        console.log("Failed to load profile for user with screen name '" + screenName + "'.");
        profileLoaded(null);
      }
    });
  }

  // Graph physics variables
  var springRestLength = 14;
  var springK = 250;
  var repulsionStrength = 20000;
  var dragConstant = 2; // Drag forces
  var pointerDragForce = 20; // Force with which nodes are dragged by the user
  var maxPointerDragForce = 8000;
  var stabilisingDeceleration = 75; // Constant deceleration applied to all nodes to stop slow movements
  var maxForceMag = 5000; // The maximum net force that will be applied to a node in a frame
  var maxPhysicsTimeStep = 1/50; // The maxmimum about of time a single step of simulation can be

  // Variables for node models
  var dpScale = 0.82; // The size of the display pic with respect to the size of the border
  var dpOutlineScale = 0.86;
  var dpBorderScale = 0.96;
  var dpGeometry = new THREE.PlaneGeometry(dpScale, dpScale);
  var dpOutlineGeometry = new THREE.PlaneGeometry(dpOutlineScale, dpOutlineScale);
  var dpBorderGeometry = new THREE.PlaneGeometry(dpBorderScale, dpBorderScale);
  var dpBorderOutlineGeometry = new THREE.PlaneGeometry(1, 1);

  var dpOutlineMat = new THREE.MeshBasicMaterial({color: 0x000000});
  var dpBorderMat = new THREE.MeshBasicMaterial({color: 0x666666});
  var highlightedDPBorderMat = new THREE.MeshBasicMaterial({color: 0xFF8800});
  var selectedDPBorderMat = new THREE.MeshBasicMaterial({color: 0x77FF77});

  var defaultDisplayPicTexture = THREE.ImageUtils.loadTexture("defaultProfilePic.png");

  /*
  var sphereRadius = 0.5;
  var sphereSegments = 16;
  var sphereRings = 16;
  var sphereGeometry = new THREE.SphereGeometry(sphereRadius, sphereSegments, sphereRings);

  var sphereMat = new THREE.MeshLambertMaterial({color: 0x888888});
  var highlightedSphereMat = new THREE.MeshLambertMaterial({color: 0xFF8800});
  var selectedSphereMat = new THREE.MeshLambertMaterial({color: 0x77FF77});
  */

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
    this.showCount = 0; // The net number of requests to display the node
    this.highlighted = false;
    this.selected = false;
    this.grabbed = false;
    this.visible = false;
    this.hasBeenShown = false;
    this.requestNeighboursCount = 0;
    this.expanded = false;

    // Functions to be called when this node's profile is loaded
    this.onLoadFuncs = [];
    this.onLoadArgs = [];

    // The base object which controls the position of the node and to which all other objects are attached
    this.object = new THREE.Object3D();

    this.dpMaterial = new THREE.MeshBasicMaterial({map: defaultDisplayPicTexture});
    this.dpMesh = new THREE.Mesh(dpGeometry, this.dpMaterial);
    this.object.add(this.dpMesh);
    this.dpOutlineMesh = new THREE.Mesh(dpOutlineGeometry, dpOutlineMat);
    this.dpOutlineMesh.position.set(0, 0, -0.01);
    this.dpMesh.add(this.dpOutlineMesh);
    this.dpBorderMesh = new THREE.Mesh(dpBorderGeometry, dpBorderMat);
    this.dpBorderMesh.position.set(0, 0, -0.02);
    this.dpMesh.add(this.dpBorderMesh);
    this.dpBorderOutlineMesh = new THREE.Mesh(dpBorderOutlineGeometry, dpOutlineMat);
    this.dpBorderOutlineMesh.position.set(0, 0, -0.03);
    this.dpBorderOutlineMesh.node = this;
    this.dpMesh.add(this.dpBorderOutlineMesh);

    this.scale = 1;

    this.textBubble = new TextBubble(this);
    this.infoPane = new InfoPane(this);
    this.object.add(this.infoPane);

    // Associative array to store references to edge objects
    this.edgesToFollowers = {};
    this.edgesToFriends = {};
    this.followerEdgesConstructed = 0;
    this.friendEdgesConstructed = 0;

    this.numShownFollowerNodes = 0;
    this.numShownFriendNodes = 0;
    this.numShownFollowerProfiles = 0;
    this.numShownFriendProfiles = 0;

    this.mass = 1;
    this.position = this.object.position;
    this.position.set(0, 0, -10);
    this.velocity = new THREE.Vector3();
    this.netForce = new THREE.Vector3();
    this.springForces = {}; // Associative array to store spring forces during force calculations
    this.accumulatedTime = 0;
  }

  Node.nodes = {}; // Dictionary of created nodes
  Node.shownNodes = {}; // Dictionary of shown nodes

  Node.get = function(id) {
    return Node.nodes[id];
  }

  /*
   * Request that the node be shown. The node will only be shown after 2 requests.
   */
    /*
   * Show the profile information for this node. This can be requested multiple times.
   * The profile information is first loaded if necessary. A count is maintained so
   * that the profile remains shown until all the nodes that asked for it to be shown
   * ask for it to be hidden again.
   */
  Node.prototype.requestShow = function(requestNeighbours) {
    ++this.showCount;
    if (this.showCount === 2) {
      // If we've reached the required number of requests, attempt to show the node.
      if (this.profileLoadAttempted) {
        if (this.profile) {
          this.show();
          if (requestNeighbours)
            this.requestShowNeighbours(false);
        }
      }
      else {
        // Fetch the profile and then show it
        this.willBeShown = true;
        var me = this;
        fetchProfileByID(this.id, function(profile) {
          me.profileLoadAttempted = true;
          if (profile) {
            me.profile = profile;
            me.makeLoadedCallbacks();
            // Before showing the profile, ensure that something didn't request the
            // profile to be hidden again in the meantime
            if (me.willBeShown) {
              me.show();
              if (requestNeighbours)
                me.requestShowNeighbours(false);
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

  /*
   * Request that the node be hidden.
   */
  Node.prototype.requestHide = function(hideNeighbours, hiddenArray) {
    if (this.showCount === 0) return;

    if (--this.showCount < 2) {
      if (hiddenArray) {
        hiddenArray.push(this);
        this.pinned = true;
      }
      else {
        this.hide();
      }
      if (hideNeighbours)
        this.requestHideNeighbours(false, hiddenArray);
    }
  }

  /*
   * Configure this node's appearance so that it displays the user's name and profile image.
   */
  Node.prototype.show = function() {
    if (!this.visible) {
      scene.add(this.object);
      Node.shownNodes[this.id] = this;
      // If we're showing the node for the first time
      if (!this.hasBeenShown) {
        this.hasBeenShown = true;
        this.scale = Math.log(this.profile.followers_count+100)/3;
        this.dpMesh.scale.set(this.scale, this.scale, 1);
        this.mass = this.scale * this.scale;
        // If we're not testing locally and there's a profile image URL, load the image
        if (!localFetch && this.profile.profile_image_url) {
          this.dpMaterial.map = THREE.ImageUtils.loadTexture(this.profile.profile_image_url);
          this.dpMaterial.needsUpdate = true;
        }
      }
      this.visible = true;
    }
  }

  /*
   * Hide the node if it is visible.
   */
  Node.prototype.hide = function() {
    // We pin during the hide animation. Unpin here.
    this.pinned = false;
    if (this.visible) {
      scene.remove(this.object);
      delete Node.shownNodes[this.id];
      this.visible = false;
    }
  }

  /*
   * This should be called when a node's profile is loaded so that it can
   * make the necessary callbacks.
   */
  Node.prototype.makeLoadedCallbacks = function() {
    for (var i = 0; i < this.onLoadFuncs.length; ++i) {
      this.onLoadFuncs[i].apply(null, this.onLoadArgs[i]);
    }
    this.onLoadFuncs = [];
    this.onLoadArgs = [];
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

  Node.prototype.expand = function() {
    if (!this.collapsing && !this.expanded) {
      this.requestShowNeighbours(true);
      this.expanded = true;
    }
  }

  Node.prototype.collapse = function(hiddenArray) {
    if (!this.collapsing && this.expanded) {
      this.requestHideNeighbours(true, hiddenArray);
      this.collapsing = true;
    }
  }

  /*
   * Show all the neighbours of this node. This won't show the profiles of the neighbours,
   * so it shouldn't be called outside of this module. Use showNeighbourProfiles for that.
   */
  Node.prototype.requestShowNeighbours = function(expanding, followerCount, friendCount) {
    if (!expanding && ++this.requestNeighboursCount > 1) return;

    // Ensure the follower and friend counts are valid
    followerCount = this.checkFollowerCount(followerCount);
    friendCount = this.checkFriendCount(friendCount);

    // Keep track of the nodes that will be newly appearing on the graph.
    var appearingNodes = [];

    // Create the neighbour nodes if they do not exist
    for (var i = 0; i < followerCount; ++i) {
      var id = this.profile.followers[i];
      var node = Node.get(id);
      if (!node)
        node = new Node(id);
    }

    for (var i = 0; i < friendCount; ++i) {
      var id = this.profile.friends[i];
      var node = Node.get(id);
      if (!node)
        node = new Node(id);
    }

    // Construct the edges between the nodes
    this.constructEdges(followerCount, friendCount);

    // Request for the neighbour nodes to be shown, and record the ones
    // which will be appearing (providing their profiles can be loaded)
    for (var i = 0; i < followerCount; ++i) {
      var node = Node.get(this.profile.followers[i]);
      node.requestShow(expanding);
      // If node is now visible
      if (node.showCount === 2)
        appearingNodes.push(node);
    }

    for (var i = 0; i < friendCount; ++i) {
      var node = Node.get(this.profile.friends[i]);
      node.requestShow(expanding);
      // If node is now visible
      if (node.showCount === 2)
        appearingNodes.push(node);
    }

    // Position the appearing nodes
    positionAppearingNodes(appearingNodes, this.position);

    this.numShownFollowerNodes = followerCount;
    this.numShownFriendNodes = friendCount;
  }

  /*
   * Hide all the neighbours of this node. Note: with the current method
   * of hiding nodes, cyclic show requests prevent proper behaviour.
   */
  Node.prototype.requestHideNeighbours = function(collapsing, hiddenArray) {
    if (--this.requestNeighboursCount > 0) return;

    for (var i = 0; i < this.numShownFollowerNodes; ++i)
      Node.get(this.profile.followers[i]).requestHide(collapsing, hiddenArray);

    for (var i = 0; i < this.numShownFriendNodes; ++i)
      Node.get(this.profile.friends[i]).requestHide(collapsing, hiddenArray);

    this.numShownFollowerNodes = 0;
    this.numShownFriendNodes = 0;
  }


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
      // If we've already had the edge constructed for us, continue
      if (this.edgesToFollowers[followerID]) continue;

      // If we already built the friend edge, update the existing edge
      var edge = this.edgesToFriends[followerID];
      if (edge) {
        this.edgesToFollowers[followerID] = edge;
        followerNode.edgesToFriends[this.id] = edge;
        this.edgesToFollowers[followerID].setArrow(this);
        attemptSetArrowScale(this.edgesToFollowers[followerID], followerNode, this);
        continue;
      }

      if (followerNode.profile) {
        // If the follower node already has a follower edge connected to us, update the existing edge
        // to reflect that they are also following us
        edge = followerNode.edgesToFollowers[this.id];
        if (edge) {
          this.edgesToFollowers[followerID] = edge;
          followerNode.edgesToFriends[this.id] = edge;
          this.edgesToFollowers[followerID].setArrow(this);
          attemptSetArrowScale(this.edgesToFollowers[followerID], followerNode, this);
          continue;
        }
      }
      // Create a new edge
      var edge = new Edge(followerNode, this);
      this.edgesToFollowers[followerID] = edge;
      followerNode.edgesToFriends[this.id] = edge;
      edge.setArrow(this);
      attemptSetArrowScale(edge, followerNode, this);
    }
    this.followerEdgesConstructed = followerCount;

    // Repeat for new shown friends node
    for (var i = this.friendEdgesConstructed; i < friendCount; ++i) {
      var friendID = friends[i];
      var friendNode = Node.get(friendID);
      // If we've already had the edge constructed for us, continue
      if (this.edgesToFriends[friendID]) continue;

      // If we already built the follower edge, update the existing edge
      var edge = this.edgesToFollowers[friendID];
      if (edge) {
        this.edgesToFriends[friendID] = edge;
        friendNode.edgesToFollowers[this.id] = edge;
        this.edgesToFriends[friendID].setArrow(friendNode);
        attemptSetArrowScale(this.edgesToFriends[friendID], this, friendNode);
        continue;
      }

      if (friendNode.profile) {
        // If the friend node already has a friend edge connected to us, update the existing edge
        // to reflect that we are also a friend of them
        edge = friendNode.edgesToFriends[this.id];
        if (edge) {
          this.edgesToFriends[friendID] = edge;
          friendNode.edgesToFollowers[this.id] = edge;
          this.edgesToFriends[friendID].setArrow(friendNode);
          attemptSetArrowScale(this.edgesToFriends[friendID], this, friendNode);
          continue;
        }
      }
      // Create a new edge
      var edge = new Edge(this, friendNode);
      this.edgesToFriends[friendID] = edge;
      friendNode.edgesToFollowers[this.id] = edge;
      edge.setArrow(friendNode);
      attemptSetArrowScale(edge, this, friendNode);
    }
    this.friendEdgesConstructed = friendCount;
  }

  function attemptSetArrowScale(edge, tailUser, headUser) {
    if (!tailUser.profile) {
      tailUser.onLoadFuncs.push(attemptSetArrowScale);
      tailUser.onLoadArgs.push([edge, tailUser, headUser]);
      return 0;
    }
    else if (!headUser.profile) {
      headUser.onLoadFuncs.push(attemptSetArrowScale);
      headUser.onLoadArgs.push([edge, tailUser, headUser]);
      return 0;
    }
    else {
      var score = calculateActivityScore(tailUser, headUser);
      edge.setArrowScale(headUser, Math.log(activityCalcLogTranslation + arrowScalingFromActivity*score));
    }
  }

  /*
   * Calculate the activity score of the first user w.r.t. the second user and return
   * a percentage (0% - 100%).
   */
  function calculateActivityScore(ofUser, aboutUser) {
		var tweetMentions = 0;
		var tweetFavorites = 0;
		var infPercentage = 0.0;
		var yesNotifications = false;

		var aboutUserScreenName = aboutUser.profile.screen_name;

		tweetMentions = countMentions(ofUser, aboutUserScreenName);
		tweetFavorites = countFavorites(ofUser, aboutUserScreenName);
		infPercentage += calculatePercentage(tweetMentions, tweetFavorites, ofUser, yesNotifications);
    // If half a user's activity is about one person, consider it maximum
    infPercentage *= 2;
    if (infPercentage > 1)
      infPercentage = 1;
		return infPercentage;
	}

	/*
	 * Counts and returns the number of mentions and replies the first user's tweets
   * contain of the second user.
	 */
	function countMentions(ofUser, aboutUserScreenName){
		var tweetMentions = 0;
		var tweets = ofUser.profile.timeline;

		for(var i = 0; i < tweets.length; ++i) {
			// Check if the tweet is in reply to the target user
			if (tweets[i].in_reply_to_screen_name === aboutUserScreenName) {
				++tweetMentions;
      }
			// Check if the tweet mentions the target user
			else if (tweets[i].entities) {
				var mentions = tweets[i].entities.user_mentions;
				if(mentions) {
					for (var j = 0; j < mentions.length; ++j) {
						if (mentions[j].screen_name === aboutUserScreenName) {
							++tweetMentions;
              break;
            }
          }
				}
			}
		}

		return tweetMentions;
	}

	/*
	 * Counts and returns the number of tweets of the second user that the first user
   * has favourited.
	 */
	function countFavorites(ofUser, aboutUserScreenName) {
		var tweetFavorites = 0;
		var favourites = ofUser.profile.favorites;

		for (var i = 0; i < favourites.length; ++i)
			if (favourites[i].user && favourites[i].user.screen_name === aboutUserScreenName)
				++tweetFavorites;

		return tweetFavorites;
	}

	function calculatePercentage(tweetMentions, tweetFavourites, ofUser, yesNotifications) {
    var tweetPercentInf = (tweetMentions > 0) ? tweetMentions/ofUser.profile.timeline.length : 0;
    var favoritePercentInf = (tweetFavourites > 0) ? tweetFavourites/ofUser.profile.favorites.length : 0;

		if(yesNotifications)
			return tweetPercentInf*0.6375+favoritePercentInf*0.2125;
		else
			return tweetPercentInf*0.75+favoritePercentInf*0.25;
	}

  /*
   * This function allows a node to keep track of how much time has passed since its last
   * physics update.
   */
  Node.prototype.addTime = function(deltaTime) {
    this.accumulatedTime += deltaTime;
  }

  /*
   * Calculate all the forces applied to this node, as well as the forces this node applies
   * to its neighbours. The position of the node is not updated in this method.
   */
  Node.prototype.calculateForces = function() {
    // Add spring forces between connected nodes

    for (var followerID in this.edgesToFollowers) {
      var follower = Node.get(followerID);
      // If the node is visible and it hasn't already calculated the spring forces itself
      if (follower.visible && !this.springForces[follower.id]) {
        var displacement = follower.position.clone().sub(this.position);
        var length = displacement.length();
        if (length > 0) {
          var stretch = length-springRestLength;
          var force = displacement.multiplyScalar(springK*stretch/length);
          this.springForces[follower.id] = force;
          follower.springForces[this.id] = force.clone().multiplyScalar(-1);
        }
      }
    }

    for (var friendID in this.edgesToFriends) {
      var friend = Node.get(friendID);
      // If the node is visible and it hasn't already calculated the spring forces itself
      if (friend.visible && !this.springForces[friend.id]) {
        var displacement = friend.position.clone().sub(this.position);
        var length = displacement.length();
        if (length > 0) {
          var stretch = length-springRestLength;
          var force = displacement.multiplyScalar(springK*stretch/length);
          this.springForces[friend.id] = force;
          friend.springForces[this.id] = force.clone().multiplyScalar(-1);
        }
      }
    }

    if (!this.selected && !this.pinned) {
      // Add forces from node proximity
      for (var id in Node.shownNodes) {
        var node = Node.get(id);
        if (node !== this) {
          var displacement = node.position.clone().sub(this.position);
          var length = displacement.length();
          displacement.multiplyScalar(-repulsionStrength*node.mass/length/length/length);
          this.netForce.add(displacement);
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
      var force = displacement.multiplyScalar(displacement.length() * pointerDragForce);
      var mag = force.length();
      // Limit the maximum drag force
      if (mag > maxPointerDragForce)
        force.multiplyScalar(maxPointerDragForce / mag);
      this.netForce.add(force);
    }
  }

  /*
   * Update the position of the node using the forces calculated in the
   * calculateForces method.
   */
  Node.prototype.applyForces = function() {
    if (this.accumulatedTime > maxPhysicsTimeStep)
      this.accumulatedTime = maxPhysicsTimeStep;

    // We don't move selected or pinned nodes
    if (!this.selected && !this.pinned) {
      // Add spring forces
      for (var id in this.springForces) {
        this.netForce.add(this.springForces[id]);
      }

      // Add drag force
      this.netForce.sub(this.velocity.clone().multiplyScalar(dragConstant*this.velocity.length()));

      // Limit maximum force
      var forceMag = this.netForce.length();
      if (forceMag === NaN) {
        this.netForce.set(0, 0, 0);
        console.log("Encountered a NaN accel value for node with ID " + this.id);
      }
      else if (forceMag > maxForceMag) {
        this.netForce.multiplyScalar(maxForceMag/forceMag);
      }

      // Update velocity
      this.velocity.add(this.netForce.multiplyScalar(this.accumulatedTime/this.mass));

      if (!this.grabbed) {
        // Apply stabilising deceleration (to help stop prolonged, slow movement of nodes)
        var vmag = this.velocity.length();
        var vdir = this.velocity.clone().divideScalar(vmag);
        var negatedVelocity = this.accumulatedTime*stabilisingDeceleration;
        if (vmag > negatedVelocity) {
          vmag -= negatedVelocity;
          this.velocity = vdir.multiplyScalar(vmag);
        }
        else this.velocity.set(0, 0, 0);
      }

      this.position.add(this.velocity.clone().multiplyScalar(this.accumulatedTime));
    }

    // Reset forces
    this.springForces = {};
    this.netForce.set(0, 0, 0);
    this.accumulatedTime = 0;
  }

  Node.prototype.updateComponents = function(deltaTime, camera, projector) {
    // Set the materials of the node's meshes to reflect its current state
    if (this.visible) {
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

    // Update text bubble
    if (this.textBubble.visible) {
      this.textBubble.scaleForDistance(zDistanceToCamera(this.position));
    }

    // Orient the node's object
    var q = this.object.quaternion;
    q.copy(camera.quaternion);
    q.x *= -1;
    q.y *= -1;
    q.z *= -1;
    q.w *= -1;
  }

  Node.prototype.highlight = function() {
    this.highlighted = true;
    if (this.profile && !this.textBubble.visible) {
      this.object.add(this.textBubble.mesh);
      this.textBubble.redraw(this.profile.name);
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
    if (this.profile) {
      if (!this.textBubble.visible) {
        this.object.add(this.textBubble.mesh);
        this.textBubble.redraw(this.profile.name);
        this.textBubble.visible = true;
      }
      this.object.add(this.infoPane.mesh);
      this.infoPane.redraw();
      this.infoPane.visible = true;
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
    if (this.infoPane.visible) {
      this.object.remove(this.infoPane.mesh);
      this.infoPane.visible = false;
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

  var edgeMaterial = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, vertexColors: THREE.VertexColors});

  var edgeHeadColorBase = new THREE.Color();
  edgeHeadColorBase.setRGB(1, 0, 0);
  var edgeHeadColorBright = new THREE.Color();
  edgeHeadColorBright.setRGB(1, 1, 0);
  var edgeTailColor = new THREE.Color();
  edgeTailColor.setRGB(0.5, 0, 1);

  var edgeHeadColorBaseH = new THREE.Color();
  edgeHeadColorBaseH.setRGB(1, 0, 0);
  var edgeHeadColorBrightH = new THREE.Color();
  edgeHeadColorBrightH.setRGB(1, 1, 0);
  var edgeTailColorH = new THREE.Color();
  edgeTailColorH.setRGB(1, 0.3, 1);

  var minArrowScale = 0.25;
  var activityCalcLogTranslation = Math.pow(Math.E, minArrowScale);
  var arrowScalingFromActivity = 5;
  var maxArrowScale = Math.log(activityCalcLogTranslation + arrowScalingFromActivity);

  /*
   * The Edge object visually depicts a relationship between two nodes.
   */
  function Edge(node1, node2)
  {
    Node.edges.push(this);
    this.node1 = node1;
    this.node2 = node2;

    // Mesh stuff
    this.object = new THREE.Object3D();
    this.leftArrowHeadGeo = createArrowHead(1);
    this.rightArrowHeadGeo = createArrowHead(-1);
    this.leftArrowHeadMesh = new THREE.Mesh(this.leftArrowHeadGeo, edgeMaterial);
    this.rightArrowHeadMesh = new THREE.Mesh(this.rightArrowHeadGeo, edgeMaterial);
    this.leftArrowHeadMesh.isArrow = false;
    this.leftArrowHeadMesh.isArrow = false;
    this.object.add(this.leftArrowHeadMesh);
    this.object.add(this.rightArrowHeadMesh);
    this.middleGeo = new THREE.Geometry();
    this.middleGeo.vertices.push(new THREE.Vector3(-0.5, -0.25, 0));
    this.middleGeo.vertices.push(new THREE.Vector3(-0.5, 0.25, 0));
    this.middleGeo.vertices.push(new THREE.Vector3(0.5, 0.25, 0));
    this.middleGeo.vertices.push(new THREE.Vector3(0.5, -0.25, 0));
    this.middleGeo.faces.push(new THREE.Face3(0, 2, 1, new THREE.Vector3(0, 0, 1)));
    this.middleGeo.faces.push(new THREE.Face3(0, 3, 2, new THREE.Vector3(0, 0, 1)));
    this.middleGeo.faces[0].vertexColors = [edgeTailColor, edgeTailColor, edgeTailColor];
    this.middleGeo.faces[1].vertexColors = [edgeTailColor, edgeTailColor, edgeTailColor];
    this.middleMesh = new THREE.Mesh(this.middleGeo, edgeMaterial);
    this.object.add(this.middleMesh);

    this.visible = false;
    this.highlighted = false;

    this.setArrowScale(node1, minArrowScale);
    this.setArrowScale(node2, minArrowScale);

    function createArrowHead(dir) {
      var geo = new THREE.Geometry();
      geo.vertices.push(new THREE.Vector3(0, 0, 0));
      geo.vertices.push(new THREE.Vector3(dir, 0.2, 0));
      geo.vertices.push(new THREE.Vector3(dir, -0.2, 0));
      geo.faces[0] = new THREE.Face3(0, 1, 2, new THREE.Vector3(0, 0, 1));
      geo.faces[0].vertexColors = [edgeTailColor, edgeTailColor, edgeTailColor];
      return geo;
    }
  }

  // An array of all edges constructed. This exists so that the main loop can update the edges.
  Node.edges = [];

  Edge.prototype.setArrow = function(node) {
    if (node === this.node1) {
      var geo = this.leftArrowHeadGeo;
      geo.vertices[1].y = 0.5;
      geo.vertices[2].y = -0.5;
      geo.verticesNeedUpdate = true;
      this.leftArrowHeadMesh.isArrow = true;
      this.updateLeftColors();
    }
    else if (node === this.node2) {
      var geo = this.rightArrowHeadGeo;
      geo.vertices[1].y = 0.5;
      geo.vertices[2].y = -0.5;
      geo.verticesNeedUpdate = true;
      this.rightArrowHeadMesh.isArrow = true;
      this.updateRightColors();
    }
    else console.log("Error: node with ID " + node.id + " passed to setArrow() for edge between node " + this.node1.id + " and node " + this.node2.id + ".");
  }

  Edge.prototype.setArrowScale = function(node, scale) {
    if (node === this.node1) {
      // Update scale
      this.leftArrowHeadMesh.scale.set(scale, scale, 1);
      this.middleGeo.vertices[0].y = -0.2*scale;
      this.middleGeo.vertices[1].y = 0.2*scale;
      this.middleGeo.verticesNeedUpdate = true;
      this.updateLeftColors();
    }
    else if (node === this.node2) {
      // Update scale
      this.rightArrowHeadMesh.scale.set(scale, scale, 1);
      this.middleGeo.vertices[2].y = 0.2*scale;
      this.middleGeo.vertices[3].y = -0.2*scale;
      this.middleGeo.verticesNeedUpdate = true;
      this.updateRightColors();
    }
    else console.log("Error: node with ID " + node.id + " passed to setArrowScale() for edge between node " + this.node1.id + " and node " + this.node2.id + ".");
  }

  Edge.prototype.updateLeftColors = function()
  {
    if (this.leftArrowHeadMesh.isArrow) {
      var scale = this.leftArrowHeadMesh.scale.x;
      if (this.highlighted) {
        var color = edgeHeadColorBaseH.clone();
        color.lerp(edgeHeadColorBrightH, (scale - minArrowScale) / (maxArrowScale-minArrowScale));
      }
      else {
        var color = edgeHeadColorBase.clone();
        color.lerp(edgeHeadColorBright, (scale - minArrowScale) / (maxArrowScale-minArrowScale));
      }

      var geo = this.leftArrowHeadGeo;
      for (var i = 0; i < 3; ++i)
        geo.faces[0].vertexColors[i] = color;
      geo.colorsNeedUpdate = true;

      var faces = this.middleGeo.faces;
      faces[0].vertexColors[0] = color;
      faces[0].vertexColors[2] = color;
      faces[1].vertexColors[0] = color;
      this.middleGeo.colorsNeedUpdate = true;
    }
    else {
      var color = this.highlighted ? edgeTailColorH : edgeTailColor;
      var geo = this.leftArrowHeadGeo;
      for (var i = 0; i < 3; ++i)
        geo.faces[0].vertexColors[i] = color;
      geo.colorsNeedUpdate = true;

      var faces = this.middleGeo.faces;
      faces[0].vertexColors[0] = color;
      faces[0].vertexColors[2] = color;
      faces[1].vertexColors[0] = color;
      this.middleGeo.colorsNeedUpdate = true;
    }
  }

  Edge.prototype.updateRightColors = function()
  {
    if (this.rightArrowHeadMesh.isArrow) {
      var scale = this.rightArrowHeadMesh.scale.x;
      if (this.highlighted) {
        var color = edgeHeadColorBaseH.clone();
        color.lerp(edgeHeadColorBrightH, (scale - minArrowScale) / (maxArrowScale-minArrowScale));
      }
      else {
        var color = edgeHeadColorBase.clone();
        color.lerp(edgeHeadColorBright, (scale - minArrowScale) / (maxArrowScale-minArrowScale));
      }

      var geo = this.rightArrowHeadGeo;
      for (var i = 0; i < 3; ++i)
        geo.faces[0].vertexColors[i] = color;
      geo.colorsNeedUpdate = true;

      var faces = this.middleGeo.faces;
      faces[0].vertexColors[1] = color;
      faces[1].vertexColors[1] = color;
      faces[1].vertexColors[2] = color;
      this.middleGeo.colorsNeedUpdate = true;
    }
    else {
      var color = this.highlighted ? edgeTailColorH : edgeTailColor;
      var geo = this.rightArrowHeadGeo;
      for (var i = 0; i < 3; ++i)
        geo.faces[0].vertexColors[i] = color;
      geo.colorsNeedUpdate = true;

      var faces = this.middleGeo.faces;
      faces[0].vertexColors[1] = color;
      faces[1].vertexColors[1] = color;
      faces[1].vertexColors[2] = color;
      this.middleGeo.colorsNeedUpdate = true;
    }
  }

  var oneOverSqrtTwo = 1 / Math.sqrt(2);

  /*
   * Determine whether the edge should currently be visible and
   * update the vertex positions for the edge.
   */
  Edge.prototype.update = function(camera, projector) {
    if (this.visible) {
      if (!this.node1.visible || !this.node2.visible) {
        scene.remove(this.object);
        this.visible = false;
      }
    }
    else {
      if (this.node1.visible && this.node2.visible) {
        scene.add(this.object);
        this.visible = true;
      }
    }

    if (!this.visible) return;

    var fullDirVector = this.node2.position.clone().sub(this.node1.position).normalize();

    // The z-distance of the two nodes from the camera
    var node1ZDist = camera.forward.dot(this.node1.position.clone().sub(camera.position));
    var node2ZDist = camera.forward.dot(this.node2.position.clone().sub(camera.position));

    // Calculate the position on screen of the nodes that aren't behind the camera
    if (node1ZDist > camera.near) {
      // The position of node 1 on the screen
      var node1Screen = projector.projectVector(this.node1.position.clone(), camera);
      // The size of node 1 on the screen (half)
      var node1ScreenHalfSizeY = projector.projectVector(
        this.node1.position.clone().add(camera.up.clone().multiplyScalar(0.5*this.node1.scale)), camera
      ).y - node1Screen.y;
      // A point nearby in the direction of the edge
      var pointAlongEdge = projector.projectVector(this.node1.position.clone().add(fullDirVector), camera);
    }

    if (node2ZDist > camera.near) {
      var node2Screen = projector.projectVector(this.node2.position.clone(), camera);
      var node2ScreenHalfSizeY = projector.projectVector(
        this.node2.position.clone().add(camera.up.clone().multiplyScalar(0.5*this.node2.scale)), camera
      ).y - node2Screen.y;
      var pointAlongEdge = projector.projectVector(this.node2.position.clone().sub(fullDirVector), camera);
    }

    // If one of the nodes is in front of the camera, use it to calculate the arrow head displacements
    if (node1ZDist > camera.near || node2ZDist > camera.near) {
      // Calculate the direction vector of the edge on the screen
      var dirVectorScreen;
      // Choose the node to get the direction vector with
      // Either will work, as long as the selected node is in front of the camera
      if (node1ZDist > node2ZDist)
        dirVectorScreen = pointAlongEdge.sub(node1Screen);
      else
        dirVectorScreen = node2Screen.clone().sub(pointAlongEdge);
      dirVectorScreen.z = 0;
      dirVectorScreen.normalize();

      // Returns theta between -180 and 180
      var theta = Math.atan2(dirVectorScreen.y, dirVectorScreen.x);
      // Find 1st quadrant equivalent for theta
      if (theta < 0)
        theta = -theta;
      if (theta > Math.PI/2)
        theta = Math.PI - theta;

      // Calculate arrow head displacements
      var displacementNode1 = 0;
      var displacementNode2 = 0;
      // If we're before the 1st corner of the square
      if (theta < Math.atan(camera.aspect)) {
        var a = (1/camera.aspect)/Math.cos(theta);
        displacementNode1 = node1ScreenHalfSizeY*a;
        displacementNode2 = -node2ScreenHalfSizeY*a;
      }
      else {
        var a = Math.sin(theta);
        displacementNode1 = node1ScreenHalfSizeY/a;
        displacementNode2 = -node2ScreenHalfSizeY/a;
      }
    }

    // Calculate the displaced arrow head position for each node
    if (node1ZDist > camera.near) {
      var node1ScreenMod = node1Screen.add(dirVectorScreen.clone().multiplyScalar(displacementNode1));
      var leftPoint = projector.unprojectVector(node1ScreenMod, camera);
    }
    else var leftPoint = this.node1.position.clone();

    if (node2ZDist > camera.near) {
      var node2ScreenMod = node2Screen.add(dirVectorScreen.clone().multiplyScalar(displacementNode2));
      var rightPoint = projector.unprojectVector(node2ScreenMod, camera);
    }
    else var rightPoint = this.node2.position.clone();

    var dispVector = rightPoint.clone().sub(leftPoint);
    var length = dispVector.length();
    var dirVector = dispVector.clone().divideScalar(length);
    var centrePosition = leftPoint.clone().add(dispVector.clone().multiplyScalar(0.5));
    // Vector from the centre of the edge to the centre of the camera
    var toCameraVector = camera.position.clone().sub(centrePosition);
    // Find the normal vector of the edge that points closest to the centre of the camera (projection of toCameraVector onto plane of possible normals)
    var normalVector = toCameraVector.sub(dirVector.clone().multiplyScalar(toCameraVector.dot(dirVector)));
    // The direction the 'top' of the edge should be facing
    var upVector = normalVector.clone().cross(dispVector).normalize();

    this.object.position = centrePosition;
    this.object.up = upVector;
    this.object.lookAt(centrePosition.clone().add(normalVector));

    this.leftArrowHeadMesh.position = new THREE.Vector3(-0.5*length, 0, 0);
    this.rightArrowHeadMesh.position = new THREE.Vector3(0.5*length, 0, 0);
    this.middleMesh.scale.x = this.rightArrowHeadMesh.position.x - this.leftArrowHeadMesh.position.x - this.leftArrowHeadMesh.scale.x - this.rightArrowHeadMesh.scale.x;
    this.middleMesh.position.x = (this.leftArrowHeadMesh.scale.x - this.rightArrowHeadMesh.scale.x)/2;
  }

  Edge.prototype.highlight = function() {
    return; // Disabled for the moment
    if (!this.highlighted) {
      this.highlighted = true;
      this.updateLeftColors();
      this.updateRightColors();
    }
  }

  Edge.prototype.unhighlight = function() {
    return;
    if (this.highlighted) {
      this.highlighted = false;
      this.updateLeftColors();
      this.updateRightColors();
    }
  }

  // Text bubble-related variables
  var textBubbleTexWidth = 520;
  var textBubbleTexHeight = 64;
  var textBubbleSize = 1/60;
  var textBubbleGeometry = new THREE.PlaneGeometry(textBubbleTexWidth/textBubbleTexHeight, 1);
  var textBubbleCanvas = document.createElement('canvas');
  var textBubbleContext = textBubbleCanvas.getContext('2d');
  textBubbleCanvas.width = textBubbleTexWidth;
  textBubbleCanvas.height = textBubbleTexHeight;
  textBubbleContext.font = "Bold "+(textBubbleTexHeight-10)+"px Courier New";

  /*
   * The TextBubble object displays a user's name on a label in 3D space.
   */
  function TextBubble(node)
  {
    this.node = node;
    this.visible = false;
    this.texture = new THREE.Texture(textBubbleCanvas);
    this.material = new THREE.MeshBasicMaterial({map: this.texture});
    this.material.transparent = false;
    this.mesh = new THREE.Mesh(
      textBubbleGeometry,
      this.material
    );
  }

  TextBubble.prototype.redraw = function(text) {
	  textBubbleContext.fillStyle = 'white';
    textBubbleContext.fillRect(0, 0, textBubbleTexWidth, textBubbleTexHeight);
    textBubbleContext.fillStyle = 'black';
    textBubbleContext.fillText(text, 8, textBubbleTexHeight-16);
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
    this.mesh.position.set(0, 0.5+this.node.scale/2+scale/2, 1);
  }

  // InfoPane-related variables
  var infoPaneTexWidth = 480 * 1.3;
  var infoPaneTexHeight = 480;
  var infoScreenHeight = 5;
  var infoPaneGeometry = new THREE.PlaneGeometry(6.5, infoScreenHeight);
  var infoPaneCanvas = document.createElement('canvas');
  var infoPaneContext = infoPaneCanvas.getContext('2d');
  infoPaneCanvas.width = infoPaneTexWidth;
  infoPaneCanvas.height = infoPaneTexHeight;

  /*
   * The InfoPane object displays a user's name on a pane in 3D space.
   */
  function InfoPane(node)
  {
    this.node = node;
    this.visible = false;
    this.texture = new THREE.Texture(infoPaneCanvas);
    this.material = new THREE.MeshBasicMaterial({map: this.texture});
    this.material.transparent = false;
    this.mesh = new THREE.Mesh(
      infoPaneGeometry,
      this.material
    );
  }

  InfoPane.prototype.redraw = function() {
	  infoPaneContext.fillStyle = 'white';
    infoPaneContext.fillRect(0, 0, infoPaneTexWidth, infoPaneTexHeight);
    infoPaneContext.fillStyle = 'black';
    infoPaneContext.font = "Bold 44px Courier New";
    infoPaneContext.fillText('@' + this.node.profile.screen_name, 12, 50);
    infoPaneContext.font = "Bold 30px Courier New";
    var lines = this.node.profile.description.split('\n');
    var words = [];
    for (var i = 0; i < lines.length; ++i) {
      words = words.concat(lines[i].split(' '));
    }
    var charactersPerLine = 33;
    var line = '';
    var charactersWritten = 0;
    var linePos = 96;
    var lineSpacing = 38;
    for (var i = 0; i < words.length; ++i) {
      if (words[i].length === 0) continue;
      if (charactersWritten + words[i].length > charactersPerLine) {
        if (charactersWritten > 0) {
          infoPaneContext.fillText(line, 14, linePos);
          line = words[i];
          charactersWritten = words[i].length;
        }
        else {
          infoPaneContext.fillText(words[i], 14, linePos);
        }
        linePos += lineSpacing;
      }
      else {
        if (charactersWritten > 0)
          line += ' ' + words[i];
        else
          line += words[i];
        charactersWritten += 1 + words[i].length;
      }
    }
    if (charactersWritten > 0) {
      infoPaneContext.fillText(line, 14, linePos);
      linePos += lineSpacing;
    }

    linePos += 12;
    infoPaneContext.font = "Bold 36px Courier New";
    if (this.node.profile.location.length > 0) {
      infoPaneContext.fillText(this.node.profile.location, 14, linePos);
      linePos += 66;
    }
    infoPaneContext.fillText('Following: ' + this.node.profile.friends_count, 14, linePos);
    linePos += 44;
    infoPaneContext.fillText('Followers: ' + this.node.profile.followers_count, 14, linePos);
    this.texture.needsUpdate = true;
    this.mesh.position.set(0, -0.5-this.node.scale/2-infoScreenHeight/2, 1);
  }

  return Node;
});














