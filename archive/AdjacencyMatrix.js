
function AdjacencyMatrix(nodes) {
	this.rows = nodes;
	this.columns = nodes;
	this.elements = new Array(nodes);
	for (var i=0; i < nodes; i++) {
		this.elements[i] = new Array(nodes);
		for (var j=0; j < nodes; j++) {
			this.elements[i][j] = 0;
		}
	}
}
AdjacencyMatrix.prototype.setElement = function (row, column, value) {
	this.elements[row][column] = value;
}
AdjacencyMatrix.prototype.getElement = function(row, column) {
	return this.elements[row][column];
}

function parseMatrix(string) {
	var rows = string.split('\n');
	var matrix = new AdjacencyMatrix(rows.length);
	
	for (var i=0; i < rows.length; i++) {
		rows[i] = rows[i].split(' ');
		for (var j=0; j < rows[i].length; j++) {
			matrix.setElement(i, j, parseInt(rows[i][j]));
		}
	}
	return matrix;
}
