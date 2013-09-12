// Tyson Jones - 12/9/13

/*
TO USE THIS MODULE (in your own html file):
0 - fill in your app's consumer key and secret tokens into this file
1 - import codebird and this file into your html (via script tags with src)
2 - declare anywhere a div with id 'authentication'; this is where the authentication dialog will appear
3 - declare a function to be called once authentication is complete (when your js script and page setup should effectively start).
4 - call authenticate(signal) in your html script, when you wish to display the authentication dialog, passing the name of your function above

NOTE:
- Your browser is likely to block a required pop-up; you will need to allow the pop-up and refresh your browser
- When authentication has finished, the contents of the 'authentication' div will be cleared (the div effectively removed) and your post-auth function will be called.
- You can setup your page before authentication (with the html) without issue, but you should remember the auth dialog ('authentication' div) will change size.

AUTHENTICATION PROCESS:
When authenticating;
	- The page will initially require some loading time (to fetch some request tokens and an auth URL from Twitter)
	- The page will open a new window (a pop up) where the user must approve the app and will be given a PIN
	- The user must enter the given PIN into the authentication dialog, which if approved, will alert the user and disappear
		If the PIN is not approved, the user will be alerted and the entire process will be repeated (until approved).
*/


authenticator = {CONSUMER_KEY:"CONSUMER", CONSUMER_KEY_SECRET:"SECRET", cb:null, signal:null};


function authenticate(flag) {
	// remember the function to call after auth completion
	authenticator.signal = flag;

	// set up widgets; requires a 'authentication' element in importing html
	document.getElementById('authentication').innerHTML='<div id="loadStatus" style="vertical-align:middle; text-align:center;">Loading Authentication...</div><div id="pinContainer" style="vertical-align:middle; text-align:center;"><b>PIN</b><br><input type="text" id="pinField" style="text-align:center" onkeyup="attemptPinSubmit(event)" disabled="true"></div>';
	
	// begin authentication chain
	prepareCodebird();
}

function prepareCodebird() {
	authenticator.cb = new Codebird;
	authenticator.cb.setConsumerKey(authenticator.CONSUMER_KEY, authenticator.CONSUMER_KEY_SECRET);
	authenticateUser();
}

function authenticateUser() {
	// gets a request token
	authenticator.cb.__call("oauth_requestToken", {oauth_callback: "oob"},
		function (reply) {
			// store it
			authenticator.cb.setToken(reply.oauth_token, reply.oauth_token_secret);
			// gets the authorize screen URL
			authenticator.cb.__call(
				"oauth_authorize",
				{},
				function (auth_url) {
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
		authenticator.cb.__call("oauth_accessToken", {oauth_verifier: document.getElementById('pinField').value},
			function (reply) {
				// successful authentication
				if (reply.httpstatus === 200) {
					// store the authenticated token, prepare the graph
					authenticator.cb.setToken(reply.oauth_token, reply.oauth_token_secret);
					clearAuthenticationFields();
					authenticator.signal();
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