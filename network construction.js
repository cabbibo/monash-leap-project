// Tyson Jones - 12/9/13

/*
TO USE THIS MODULE (in your own html file):
0 - import codebird.js and authentication.js into your html (via script tags)
1 - declare a function to be called when the network has been successfully mapped, which
	has 1 paramater; it will be passed an associative array of user_id vs user_objects.
2 - call launchConstruction(id, depth, func), where id is the user_id to build around, 
	depth is the network depth to build to, and function is your function declared in step 1.
*/

network = {users:{}, timers:{}, callback:null,
		   usersAwaiting:{}, usersQueue:[],
		   friendsAwaiting:{}, friendsQueue:[],
		   followersAwaiting:{}, followersQueue:[]
};

// user objects filling network.users
function User(depth) {
	// depth of this user's network that is mapped (max)
	this.depth = depth;
	// the Twitter API profile for this user
	this.data = null;
	// list of friends followers user ids
	this.friends = null;
	this.followers = null;
}
User.prototype.setData = function(data) {
	this.data = data;
}
User.prototype.setDepth = function(depth) {
	this.depth = depth;
}
User.prototype.setFriends = function(friends) {
	this.friends = friends;
}
User.prototype.setFollowers = function(followers) {
	this.followers = followers;
}

function launchConstruction(id, depth, func) {

	// prepare the network for the pivot user
	network.callback = func;
	registerUser(id, depth);
	
	// setup timers to periodically serve queues around rate limits, or check for completion
	network.timers['users'] = setInterval(serveUsersQueue, 16 * 1000);
	network.timers['friends'] = setInterval(serveFriendsQueue, 61 * 1000);
	network.timers['followers'] = setInterval(serveFollowersQueue, 61 * 1000);
	network.timers['execution'] = setInterval(checkProgress, 15 * 1000);
}


// build a network around the given us to this depth
function registerUser(id, depth) {
	if (depth > 0) {
		requestUser(id, depth);			
		requestFriends(id, depth);
		requestFollowers(id, depth);
	}
}

// check the user hasn't been fetched elsewhere, else push to queue
function requestUser(id, depth) {
	if (id in network.users) {
		if (depth > network.users[id].depth) {
			// this depth is merely a flag;
			// we've already fetched user, so just update depth (for flag)
			network.users[id].depth = depth;
		}
	} else if (id in network.usersAwaiting) {
		if (depth > network.usersAwaiting[id]) {
			// if user is waiting for fetch already, just update depth (for recursion)
			network.usersAwaiting[id] = depth;
		}
	} else {
		// signify the user hasn't yet reached network.users
		network.usersAwaiting[id] = depth;
		// add the user to the queue
		network.usersQueue.push(id);
		// create the user object, with the current desired depth (may increase)
		network.users[id] = new User(depth);
	}
}
// check the user hasn't had followers fetched/requested, else push to queue
function requestFollowers(id, depth) {	
	if (id in network.followersAwaiting) {
		if (depth > network.followersAwaiting[id]) {
			// if we're waiting for user's network already, just update depth (for recursion)
			network.followersAwaiting[id] = depth;
		}
	} else {
		// we need to fetch or refetch the network, to expand
		if (network.users[id].followers == null || depth > network.users[id].depth) {      // redownloads shallow network when deepening (meh), because friends not gauranteed fetched yet
			// signify the user's network awaits download
			network.followersAwaiting[id] = depth;
			// push the request onto the queue
			network.followersQueue.push(id);
		}
	}
}
// analogous to the followers system, but with friends
function requestFriends(id, depth) {	
	if (id in network.friendsAwaiting) {
		if (depth > network.friendsAwaiting[id]) {
			network.friendsAwaiting[id] = depth;
		}
	} else {
		if (network.users[id].friends == null || depth > network.users[id].depth) {      // redownloads shallow network when deepening (meh), because followers not gauranteed fetched yet
			network.friendsAwaiting[id] = depth;
			network.friendsQueue.push(id);
		}
	}
}

// serve the user queue in batches of 100
function serveUsersQueue() {
	if (network.usersQueue.length > 0) {
		var batch = []
		for (var i=0; i < 100 && network.usersQueue.length > 0; i++) {
			batch.push(network.usersQueue.shift());
		}
		authenticator.cb.__call('users_lookup', {'user_id':batch.join(',')},
		function (reply) {
			console.log('retrieved user objects:');
			console.log(reply);
			for (var i=0; i < reply.length; i++) {
				// fill the data recieved into the user objects
				network.users[reply[i].id].setData(reply[i]);
				// update the depth flag, incase it increased unexpectedly
				network.users[reply[i].id].setDepth(network.usersAwaiting[reply[i].id]);
				// remove user from awaiting
				delete network.usersAwaiting[reply[i].id];
			}
		});
	}
}
// serve the friends queue (just 1)
function serveFriendsQueue() {
	if (network.friendsQueue.length > 0) {
		var id = network.friendsQueue.shift();
		authenticator.cb.__call('friends_ids', {'user_id':id},
		function (reply) {
			console.log('giving to '+id+', friends:');
			console.log(reply.ids);
			// give the user his friends
			network.users[id].setFriends(reply.ids);
			for (var i=0; i < reply.ids.length; i++) {
				// recurse, expanding the network outward, with decreased depth
				registerUser(reply.ids[i], network.friendsAwaiting[id]-1);
			}
			// remove the request marker
			delete network.friendsAwaiting[id];
		});
	}
}
// analogous to the friends system
function serveFollowersQueue() {
	if (network.followersQueue.length > 0) {
		var id = network.followersQueue.shift();
		authenticator.cb.__call('followers_ids', {'user_id':id},
		function (reply) {
			console.log('giving to '+id+', followers:');
			console.log(reply.ids);
			network.users[id].setFollowers(reply.ids);
			for (var i=0; i < reply.ids.length; i++) {
				registerUser(reply.ids[i], network.followersAwaiting[id]-1);
			}
			delete network.followersAwaiting[id];
		});
	}
}

// check that network activity continues, else we've finished building the network
function checkProgress() {
	var finished = true;
	for (var key in network.usersAwaiting) {
		if (network.usersAwaiting.hasOwnProperty(key)) {
			finished = false;
			break;
		}
	}
	for (var key in network.friendsAwaiting) {
		if (network.friendsAwaiting.hasOwnProperty(key)) {
			finished = false;
			break;
		}
	}
	for (var key in network.followersAwaiting) {
		if (network.followersAwaiting.hasOwnProperty(key)) {
			finished = false;
			break;
		}
	}
	
	// there are no network requests waited for
	if (finished) {
		// stop timers
		clearInterval(network.timers['users']);
		clearInterval(network.timers['friends']);
		clearInterval(network.timers['followers']);
		clearInterval(network.timers['execution']);
		
		// return the built network
		network.callback(network.users);
	}
}