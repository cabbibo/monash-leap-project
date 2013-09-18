/*
This module defines all objects and functions needed to handle input from
the mouse, keyboard, and Leap Motion.
*/

"use strict";

define(function() {

  var Input = {};
  Input.mouse = new THREE.Vector2(0, 0);
  Input.currentPointer = Input.mouse;

  // Leap controller variables
  Input.leap = new Leap.Controller();

  Input.leap.on('connect', function() {
    console.log("Leap Motion successfully connected.");
  });

  Input.leap.on('deviceConnected', function() {
    console.log("The Leap device has been connected.");
  });

  Input.leap.on('deviceDisconnected', function() {
    console.log("The Leap device has been disconnected.");
  });

  Input.leap.connect();

  Input.prevLeapFrame = Input.leap.frame(0);
  Input.currLeapFrame = Input.leap.frame(0);

  // Mouse input handling
  document.addEventListener('mousedown',
                          function(event) {
                            // Which mouse button?
                            switch (event.which) {
                              case 1:
                                Input.mouse.leftHeld = true;
                                if (Input.mouse.leftPressedCallback !== undefined)
                                  Input.mouse.leftPressedCallback();
                                break;
                              case 2:
                                Input.mouse.middleHeld = true;
                                break;
                              case 3:
                                Input.mouse.rightHeld = true;
                            }

                          }
                         );
  document.addEventListener('mouseup',
                          function(event) {
                            switch (event.which) {
                              case 1:
                                Input.mouse.leftHeld = false;
                                if (Input.mouse.leftReleasedCallback !== undefined)
                                  Input.mouse.leftReleasedCallback();
                                break;
                              case 2:
                                Input.mouse.middleHeld = false;
                                break;
                              case 3:
                                Input.mouse.rightHeld = false;
                            }
                          }
                         );
  document.addEventListener('mousemove',
                            function(event) {
                              event.preventDefault();
                              Input.currentPointer = Input.mouse;
                              Input.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                              Input.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
                            },
                            false);

  // Keyboard input handling
  Input.keyboard = {};
  Input.keyboard.key = {};
  Input.keyboard.keyToggle = {};
  Input.keyboard.keyPressed = {};
  Input.keyboard.keyReleased = {};

  function translateKeycode(code) {
    if (code>=65 && code<65+26) return "abcdefghijklmnopqrstuvwxyz"[code-65];
    if (code>=48 && code<48+10) return "0123456789"[code-48];
    if (code>=37 && code<=40) return "AWDS"[code-37]; // arrow keys labelled in WASD fashion

    if (code==32) return ' '; // space
    if (code==27) return 0x1B; // esc
    if (code==192) return '`'; // backtick/tilde
    if (code==13) return '\n'; // newline
    if (code==59) return ';';
    if (code==61) return '=';
    if (code==173) return '-';

    return code; // unconverted numeric code
  }

  document.addEventListener('keydown',function(evt) {
    //evt.preventDefault(); // don't do browser built-in search with key press
    var t = translateKeycode(evt.keyCode);

    if (!Input.keyboard.key[t]) { // key wasn't pressed
      Input.keyboard.keyToggle[t] = !Input.keyboard.keyToggle[t];
      Input.keyboard.keyPressed[t] = true;
    }
    Input.keyboard.key[t] = true;
  }, false);

  document.addEventListener('keyup',function(evt) {
    var t = translateKeycode(evt.keyCode);
    Input.keyboard.key[t] = false;
    Input.keyboard.keyReleased[t] = true;
  }, false);

  Input.update = function()
  {
    // Fetch new Leap frames
    Input.prevLeapFrame = Input.currLeapFrame;
    Input.currLeapFrame = Input.leap.frame();
  }

  Input.reset = function()
  {
    // Reset keys
    for (var t in Input.keyboard.keyPressed) {
      Input.keyboard.keyPressed[t] = false;
    }
    for (var t in Input.keyboard.keyReleased) {
      Input.keyboard.keyReleased[t] = false;
    }
  }

  return Input;
});






