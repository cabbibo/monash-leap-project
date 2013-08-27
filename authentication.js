
/****************************** HTML CONSTRUCTION *******************************************/
document.write('<body onload="prepareCodebird()"></body><div id="loadStatus" style="vertical-align:middle; text-align:center;">Loading Authentication...</div><div id="pinContainer" style="vertical-align:middle; text-align:center;"><b>PIN</b><br><input type="text" id="pinField" style="text-align:center" onkeyup="attemptPinSubmit(event)" disabled="true"></div><script type="text/javascript" src="codebird/sha1.js"></script><script type="text/javascript" src="codebird-js/codebird.js"></script>');


/****************************** AUTHENTICATION DIALOG **************************************/
var CONSUMER_KEY = "YOUR APP KEY";
var CONSUMER_KEY_SECRET = "YOUR APP KEY SECRET";

var cb;

function prepareCodebird() {
	cb = new Codebird;
	cb.setConsumerKey(CONSUMER_KEY, CONSUMER_KEY_SECRET);
	authenticateUser();
}

function authenticateUser() {
	// gets a request token
	cb.__call("oauth_requestToken", {oauth_callback: "oob"},
		function (reply) {
			console.log(reply);
			// store it
			cb.setToken(reply.oauth_token, reply.oauth_token_secret);
			// gets the authorize screen URL
			cb.__call(
				"oauth_authorize",
				{},
				function (auth_url) {
					console.log(auth_url);
					reportAuthenticationScreenLoaded();
					openAuthenticationScreen(auth_url);
				}
			);
		}
	);
}

function reportAuthenticationScreenLoaded() {
	// allow pin entry
	document.getElementById('loadStatus').innerHTML="Authentication window loaded<br><i>(check your popup blocker)</i>";
	document.getElementById('pinField').disabled=false;
}

function openAuthenticationScreen(auth_url) {
	// calibrating dimensions (for centering)
	var HEIGHT=550;
	var WIDTH=500;
	var left = (screen.width/2)-(WIDTH/2);
	var top = (screen.height/2)-(HEIGHT/2);
	
	// open the auth window
	codebird_auth = window.open(auth_url, '', 'width='+WIDTH+', height='+HEIGHT+', top='+top+', left='+left+', scrollbars=no, directories=no, location=no, menubar=no, status=no, titlebar=no, toolbar=no');
}

function attemptPinSubmit(event) {
	// enter key pressed
	if (event.keyCode === 13) {
		document.getElementById('pinField').disabled=true;
		document.getElementById('loadStatus').innerHTML="Checking PIN...";
		cb.__call("oauth_accessToken", {oauth_verifier: document.getElementById('pinField').value},
			function (reply) {
				console.log(reply);
				// successful authentication
				if (reply.httpstatus === 200) {
					// store the authenticated token, prepare the graph
					cb.setToken(reply.oauth_token, reply.oauth_token_secret);
					clearAuthenticationFields();
					alert("Authentication successful");
					setupDisplay();
				} else {
					alertPinError();
				}
			}
		);
	}
}

function alertPinError() {
	// reset fields and repeat authentication process (recursive)
	alert('The PIN was incorrect and must be resent');
	document.getElementById('loadStatus').innerHTML="Loading Authentication...";
	document.getElementById('pinField').value='';
	document.getElementById('pinField').disabled=true;
	authenticateUser();
}

function clearAuthenticationFields() {
	// hide the authentication crap
	document.getElementById('loadStatus').innerHTML='';
	document.getElementById('pinContainer').innerHTML='';
}

/************************************ YOUR CODE *********************************/

// this method will be called just after the user has been successfully authenticated and the screen is cleared.
// it is called on line 73 (if you want to rename it)
function setupDisplay() {
	
}