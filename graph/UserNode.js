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
          profile.followers = user.followers;
          profile.friends = user.friends;

          if (user.timeline)
            profile.timeline = JSON.parse(user.timeline);
          else
            profile.timeline = [];

          if (user.favorites)
            profile.favorites = JSON.parse(user.favorites);
          else
            profile.favorites = [];
        }
        catch (e) {
          console.log(e);
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
          profile.followers = user.followers;
          profile.friends = user.friends;

          if (user.timeline)
            profile.timeline = JSON.parse(user.timeline);
          else
            profile.timeline = [];

          if (user.favorites)
            profile.favorites = JSON.parse(user.favorites);
          else
            profile.favorites = [];
        }
        catch (e) {
          console.log(e);
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
    this.dpOutlineMesh.position.set(0, 0, -0.01);
    this.dpMesh.add(this.dpOutlineMesh);
    this.dpBorderMesh = new THREE.Mesh(dpBorderGeometry, dpBorderMat);
    this.dpBorderMesh.position.set(0, 0, -0.02);
    this.dpMesh.add(this.dpBorderMesh);
    this.dpBorderOutlineMesh = new THREE.Mesh(dpBorderOutlineGeometry, dpOutlineMat);
    this.dpBorderOutlineMesh.position.set(0, 0, -0.03);
    this.dpBorderOutlineMesh.node = this;
    this.dpMesh.add(this.dpBorderOutlineMesh);

    this.textBubble = new TextBubble(this);
    this.scale = 1;

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
    this.accumulatedTime = 0;
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
    this.scale = Math.log(this.profile.followers_count+1)/Math.log(100)+1;
    this.dpMesh.scale.set(this.scale, this.scale, 1);
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
        this.edgesToFollowers[followerID].setArrow(this);
        this.edgesToFollowers[followerID].setArrowScale(this, calcArrowScaleFromInfluence(followerNode, this));
        continue;
      }

      if (followerNode.profileLoaded) {
        // If the follower node already has a friend edge connected to us, keep the existing edge
        if (followerNode.edgesToFriends[this.id]) {
          this.edgesToFollowers[followerID] = followerNode.edgesToFriends[this.id];
          this.edgesToFollowers[followerID].setArrowScale(this, calcArrowScaleFromInfluence(followerNode, this));
          continue ;
        }

        // If the follower node already has a follower edge connected to us, update the existing edge
        // to reflect that they are also following us
        if (followerNode.edgesToFollowers[this.id]) {
          this.edgesToFollowers[followerID] = followerNode.edgesToFollowers[this.id];
          this.edgesToFollowers[followerID].setArrow(this);
          this.edgesToFollowers[followerID].setArrowScale(this, calcArrowScaleFromInfluence(followerNode, this));
          continue;
        }
      }
      // Create a new edge
      var edge = new Edge(followerNode, this);
      this.edgesToFollowers[followerID] = edge;
      followerNode.edgesToFriends[this.id] = edge;
      edge.setArrow(this);
      edge.setArrowScale(this, calcArrowScaleFromInfluence(followerNode, this));
    }
    this.followerEdgesConstructed = followerCount;

    // Repeat for new shown friends node
    for (var i = this.friendEdgesConstructed; i < friendCount; ++i) {
      var friendID = friends[i];
      var friendNode = Node.get(friendID);

      // If we already built the follower edge, update the existing edge
      if (this.edgesToFollowers[friendID]) {
        this.edgesToFriends[friendID] = this.edgesToFollowers[friendID];
        this.edgesToFriends[friendID].setArrow(friendNode);
        this.edgesToFriends[friendID].setArrowScale(friendNode, calcArrowScaleFromInfluence(this, friendNode));
        continue;
      }

      if (friendNode.profileLoaded) {
        // If the friend node already has a follower edge connected to us, keep the existing edge
        if (friendNode.edgesToFollowers[this.id]) {
          this.edgesToFriends[friendID] = friendNode.edgesToFollowers[this.id];
          this.edgesToFriends[friendID].setArrowScale(friendNode, calcArrowScaleFromInfluence(this, friendNode));
          continue;
        }
        // If the friend node already has a friend edge connected to us, update the existing edge
        // to reflect that we are also a friend of them
        var theirFriends = friendNode.profile.friends;
        if (friendNode.edgesToFriends[this.id]) {
          this.edgesToFriends[friendID] = friendNode.edgesToFriends[this.id];
          this.edgesToFriends[friendID].setArrow(friendNode);
          this.edgesToFriends[friendID].setArrowScale(friendNode, calcArrowScaleFromInfluence(this, friendNode));
          continue;
        }
      }
      // Create a new edge
      var edge = new Edge(this, friendNode);
      this.edgesToFriends[friendID] = edge;
      friendNode.edgesToFollowers[this.id] = edge;
      edge.setArrow(friendNode);
      edge.setArrowScale(friendNode, calcArrowScaleFromInfluence(this, friendNode));
    }
    this.friendEdgesConstructed = friendCount;
  }

  function calcArrowScaleFromInfluence(onUser, fromUser) {
    return Math.log(influenceCalcLogTranslation + arrowScalingFromInfluence*calculateInfluence(onUser, fromUser));
  }

  /*
   * Calculate the influence of the second user on the first user and return
   * a percentage score (0% - 100%).
   */
  function calculateInfluence(onUser, fromUser) {
    if (!onUser.profile || !fromUser.profile) return 0;
		var tweetMentions = 0;
		var tweetFavorites = 0;
		var infPercentage = 0.0;
		var yesNotifications = false;

		var fromUserScreenName = fromUser.profile.screen_name;

    /*
		if(X1isCenter && onUser.centralUser == true){
			yesNotifications = true;
			if(userX2.notifications != null && userX2.notifications == true)
				infPrecetage += 0.15;
		}
    */

		tweetMentions = countMentions(onUser, fromUserScreenName);
		tweetFavorites = countFavorites(onUser, fromUserScreenName);
		infPercentage += calculatePercentage(tweetMentions, tweetFavorites, onUser, yesNotifications);
    // If half a user's activity is about one person, consider it maximum influence
    infPercentage *= 2;
    if (infPercentage > 1)
      infPercentage = 1;
    if (infPercentage > 0)
      console.log(infPercentage);
		return infPercentage;
	}

	/*
	 * Counts and returns the number of mentions and replies the first user's tweets
   * contain of the second user.
	 */
	function countMentions(onUser, fromUserScreenName){
		var tweetMentions = 0;
		var tweets = onUser.profile.timeline;

		for(var i = 0; i < tweets.length; ++i) {
			// Check if the tweet is in reply to the target user
			if (tweets[i].in_reply_to_screen_name === fromUserScreenName) {
				++tweetMentions;
      }
			// Check if the tweet mentions the target user
			else if (tweets[i].entities) {
				var mentions = tweets[i].entities.user_mentions;
				if(mentions) {
					for (var j = 0; j < mentions.length; ++j) {
						if (mentions[j].screen_name === fromUserScreenName) {
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
	function countFavorites(onUser, fromUserScreenName) {
		var tweetFavorites = 0;
		var favourites = onUser.profile.favorites;

		for (var i = 0; i < favourites.length; ++i)
			if (favourites[i].user && favourites[i].user.screen_name === fromUserScreenName)
				++tweetFavorites;

		return tweetFavorites;
	}

	function calculatePercentage(tweetMentions, tweetFavourites, onUser, yesNotifications) {
    var tweetPercentInf = (tweetMentions > 0) ? tweetMentions/onUser.profile.timeline.length : 0;
    var favoritePercentInf = (tweetFavourites > 0) ? tweetFavourites/onUser.profile.favorites.length : 0;

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
          displacement.multiplyScalar(-repulsionStrength*node.scale/length/length/length);
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
  Node.prototype.applyForces = function() {
    if (this.accumulatedTime > maxPhysicsTimeStep)
      this.accumulatedTime = maxPhysicsTimeStep;

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
      this.velocity.add(this.accel.multiplyScalar(this.accumulatedTime));

      // Round to zero for very small velocities to stop slow drifting when node is not being dragged
      if (this.grabbed) {
        this.position.add(this.velocity.clone().multiplyScalar(this.accumulatedTime));
      }
      else {
        // Apply stabilising force (to help stop prolonged, slow movement of nodes)
        var vmag = this.velocity.length();
        var vdir = this.velocity.clone().divideScalar(vmag);
        var negatedVelocity = this.accumulatedTime*stabilisingForce;
        if (vmag > negatedVelocity) {
          vmag -= negatedVelocity;
          // Update position
          this.position.add(vdir.multiplyScalar(this.accumulatedTime*vmag));
        }
        else this.velocity.set(0, 0, 0);
      }
    }

    // Reset forces
    this.springForces = {};
    this.accel.set(0, 0, 0);
    this.accumulatedTime = 0;
  }

  Node.prototype.updateComponents = function(deltaTime, camera, projector) {
    if (!this.selected) {
      // Update edges
      for (var ID in this.edgesToFollowers)
        this.edgesToFollowers[ID].update(camera, projector);
      for (var ID in this.edgesToFriends)
        this.edgesToFriends[ID].update(camera, projector);
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

  var edgeMaterial = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, vertexColors: THREE.VertexColors});
  //var edgeArrowColor = new THREE.Color(0xffffff);
  var edgeHeadColorBase = new THREE.Color();
  edgeHeadColorBase.setRGB(1, 0, 0);
  var edgeHeadColorBright = new THREE.Color();
  edgeHeadColorBright.setRGB(1, 1, 0);
  var edgeTailColor = new THREE.Color();
  edgeTailColor.setRGB(0.5, 0, 1);
  var minArrowScale = 0.25;
  var influenceCalcLogTranslation = Math.pow(Math.E, minArrowScale);
  var arrowScalingFromInfluence = 1.5;
  var maxArrowScale = Math.log(influenceCalcLogTranslation + arrowScalingFromInfluence);

  /*
   * The Edge object visually depicts a relationship between two nodes.
   */
  function Edge(node1, node2)
  {
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
    this.doubleFollower = false;

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
      var color = edgeHeadColorBase.clone();
      color.lerp(edgeHeadColorBright, (scale - minArrowScale) / (maxArrowScale-minArrowScale));

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
      var color = edgeHeadColorBase.clone();
      color.lerp(edgeHeadColorBright, (scale - minArrowScale) / (maxArrowScale-minArrowScale));

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
      else positionMeshes.call(this);
    }
    else {
      if (this.node1.visible && this.node2.visible) {
        scene.add(this.object);
        this.visible = true;
        positionMeshes.call(this);
      }
    }

    function positionMeshes() {
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
  }

  Edge.prototype.highlight = function() {
    return;
    this.lineGeo.colors[1].setHex(friendColorHighlighted);
    if (this.doubleFollower)
      this.lineGeo.colors[0].setHex(friendColorHighlighted);
    else
      this.lineGeo.colors[0].setHex(followerColorHighlighted);
    this.lineGeo.colorsNeedUpdate = true;
  }

  Edge.prototype.unhighlight = function() {
    return;
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
  function TextBubble(node)
  {
    this.node = node;
    this.visible = false;
    this.texture = new THREE.Texture(drawingCanvas);
    this.material = new THREE.MeshBasicMaterial({map: this.texture});
    this.material.transparent = false;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(textWidth/textHeight, 1),
      this.material
    );
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
    this.mesh.position.set(0, 0.5*this.node.scale+scale/2, 1);
  }

  return Node;
});




