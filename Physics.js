
function Vector(x, y, z) {
	this.x=x; this.y=y; this.z=z;
}
Vector.prototype.getMagnitude = function() {
	return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2) + Math.pow(this.z, 2));
}
Vector.prototype.multiplyBy = function(scalar) {
	return new Vector(this.x * scalar, this.y * scalar, this.z * scalar);
}
Vector.prototype.divideBy = function(scalar) {
	return new Vector(this.x / scalar, this.y / scalar, this.z / scalar);
}
Vector.prototype.plus = function(vector) {
	return new Vector(this.x + vector.x, this.y + vector.y, this.z + vector.z);
}
Vector.prototype.minus = function(vector) {
	return new Vector(this.x - vector.x, this.y - vector.y, this.z - vector.z);
}
Vector.prototype.getUnitVector = function() {
	var m = this.getMagnitude();
	return this.divideBy(m);
}

function Body(data, position, mass, stiffness, charge) {
	this.data = data;
	this.mass = mass;
	this.position = position;
	this.force = new Vector(0,0,0);
	this.velocity = new Vector(0,0,0);
	this.stiffness = stiffness;
	this.charge = charge;
}
Body.prototype.addSpringForce = function(other) {
	var displacement = other.position.minus(this.position);
	this.force = this.force.plus(displacement.multiplyBy(this.stiffness));
}
Body.prototype.addElectrostaticForce = function(other) {
	var K = 8.987 * Math.pow(10, 9);
	var displacement = this.position.minus(other.position);
	var force = (K * other.charge * this.charge) / (Math.pow(displacement.getMagnitude(), 2));
	this.force = this.force.plus(displacement.getUnitVector().multiplyBy(force));
}
Body.prototype.simulate = function(duration) {
	// calculate acceleration
	var acceleration = this.force.divideBy(this.mass);
	// update position
	var displacement = this.velocity.multiplyBy(duration).plus(acceleration.divideBy(2).multiplyBy(Math.pow(duration, 2)));
	this.position = this.position.plus(displacement);
	// update velocity
	this.velocity = this.velocity.plus(acceleration.multiplyBy(duration));
	// clear forces
	this.force = new Vector(0, 0, 0);
	// return length moved
	return displacement.getMagnitude();
}