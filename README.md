monash-leap-project
===================

A student project involving the use of the Leap Motion to explore Twitter content.

This project was developed as part of the Monash University, Faculty of Information Technology Unit: FIT2044 - Advanced Project.

The project team consisted of:
Nicholas Smith
Tyson Jones
Keren Burshtein
Jon McCormack (supervisor)

You can run a functional version of the application here, provided the server is active:
http://fit-stu15-v01.infotech.monash.edu.au/~tjon14/graphing/graph.html

## Controls for 3D Graph Interaction

### Keyboard & Mouse

Zoom in and out: W/S

Select node: Left mouse button

Rotate around selected node: Hold right mouse button and move mouse

Expand neighbours of node: 1

Collapse neighbours of node: 2

Pause the graph simulation: space

### Leap Motion

Zoom and rotation: Sweeping movement of a single spread-palm hand

Selection: Single finger point with one hand, spread-palm-to-closed-fist motion with another hand

Expand and collapse neighbours: Make stretch and squeeze gestures in the horizontal direction <------->

## Important things to note

Because of Twitter's API restrictions, we are unable to collect data in real time. The code is set up to request pre-cached Twitter data from a Monash server, or alternatively, from the local files named by user ID. You can change this behaviour with the 'localFetch' flag in UserNode.js. Currently, if you wish to use your own data with the application, you will need to develop a means to collect it through Twitter's API.

The application runs best in Google Chrome, and may not work in some browsers. If you're trying to run the code locally using Chrome, you will need to enable cross-origin file access. Launching Chrome with the following command will do the trick:

(google_chrome_path) --allow-file-access-from-files (file_path)\graph.html

Also worth noting is that due to the short development time of the project, parts of the code may be poorly structured and there may be bugs. In particular, the graph expanding and collapsing code does not work to specification. You may be unable to collapse portions of the graph due to cyclic dependencies in node-showing. The code for this functionality will need rewriting if it is to produce the intended behaviour.

## License

Copyright (c) 2013, Faculty of Information Technology, Monash University.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of Monash University nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.