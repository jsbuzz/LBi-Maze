
var API = {
  getNode : function(maze,id,todo,error){
		this.ajax('/Maze/Location/'+maze.name+'/'+id+'/json',todo,error);
	},
	getStart : function(maze,todo){
		this.ajax('/Maze/Location/'+maze.name+'/start/json',todo,this.error);
	},
	sendHighScore : function(maze,path){
		var post = {
			player_name : 'Matyas Buczko',
			email_address :'matyas.buczko@gmail.com',
			computer_language : 'javascript',
			maze_name : maze.name,
			maze_path : path.join(',')
		};

		this.ajax('/Maze/SubmitHighScore/json',Maze.next,this.error,post);
	},
	error : function(e){console.error(this,e)},

	ajax : function(url,onSuccess,onError,post){
		var r = new XMLHttpRequest();
		r.onreadystatechange = function(){
			if(this.readyState==4)
			{
				if(this.status == 200)
					onSuccess.call(r,r.response);
				else
					onError.call(r,this.status);
			}
		};
		r.open(post ? "POST" : "GET",url,true);
		post && r.setRequestHeader("Content-type","application/x-www-form-urlencoded");
		r.send(post ? API.toUrl(post) : 0);
	},

	toUrl : function(obj) {
		var str = [];
		for(var p in obj)
			str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
		return str.join("&");
	}
};

var Node = function(maze,id,type,exits){

	this.maze = maze;
	this.id = (id.split("/")).pop();
	this.type = type || 0;

	if(typeof(exits)=='object' && exits.length)
	{
		for(var i=0;i<exits.length;i++)
			exits[i] = (exits[i].split("/")).pop();
	}
	this.exits = exits || [];

	this.attempts = 0;
	this.distance = Infinity;

	this.setDistance = function(distance,exitPath){
		distance = distance || 0;
		if(distance < this.distance)
		{
			this.distance = distance;
			exitPath && (this.exitPath = exitPath);

			for(var i=0;i<this.exits.length;i++)
			{
				if(this.maze.nodes[this.exits[i]].exits.indexOf(this.id)>-1)
					this.maze.nodes[this.exits[i]].setDistance(1+distance,this.id);
			}
		}
	};

	this.next = function(){
		return this.exitPath ? this.maze.nodes[this.exitPath] : null;
	};


	// failed attempt to find the best route
	this.eatThru = function(path,pills,covered){
		
		if(!path)
		{
			console.log('start');
			pills = {};
			covered=0;
			path = [];
			this.maze.fullPath = [];
			Node.steps = 0;
		}

		Node.steps++;

		if(this.maze.fullPath.length && path.length > this.maze.fullPath.length || path.length > 800)
		{
			return false;
		}

		path.push(this.id);
		if(this.type=='PowerPill')
		{
			if(typeof(pills[this.id])=='undefined')
				covered++;

			pills[this.id]=1;
		}

		if(this.type=='Exit')
		{
			console.log('exit reached');

			if(covered == this.maze.powerPills.length)
			{
				this.maze.fullPath = path;
				return true;
			}
			else
			{
				return false;
			}
		}

		var returnValue = false;
		for(var i=0;i<this.exits.length;i++)
		{
			if(path[path.length-1]!=this.exits[i])
				returnValue = this.maze.nodes[this.exits[i]].eatThru(path,pills,covered) || returnValue;
		}

		return returnValue;
	};
};

var Maze = function(name){
	this.name = name || 'easy';
	this.initialized = false;

	this.nodes = {};
	this.exitNode = null;
	this.startNode = null;
	this.powerPills = [];
	this.errorLog = {};
	this.nodeCount = 0;
	this.discoveryQueue = [];

	console.log("starting "+name);

	this.addNode = function(data){
		var node = JSON.parse(data);
		node = (this.nodes[node.LocationId] = new Node(this,node.LocationId,node.LocationType,node.Exits));
		this.nodeCount++;

		if(node.type!='Normal')
			console.log(node.id,node.type);

		if(node.type=='Exit')
			this.exitNode = node;
		else if(node.type=='Start')
			this.startNode = node;
		else if(node.type=='PowerPill')
			this.powerPills.push(node);

		for(var i=0;i < node.exits.length;i++)
		{
			if(typeof(this.nodes[node.exits[i]])=='undefined')
				this.discoveryQueue.push(node.exits[i]);
		}

		this.discover();
	};

	this.nodeFail = function(id){
		if(typeof(this.errorLog[i])=='undefined')
			this.errorLog[i] = 1;
		if(this.errorLog[i]++ < 3)
			this.discoveryQueue.push(id);
		else
			console.error(id+' failed more than 3 times');	
	};

	// failed attempt...
	this.getFullPath2 = function(){

		// Let's find the best route
		this.resetDistances();
		this.exitNode.setDistance();
		var powerPills = this.powerPills;

		var route = [],
		    lastNode = this.exitNode;

		while(powerPills.length)
		{
			console.log(powerPills.length+' to go');
			var minDistance=Infinity,
			    minLocation = 0;
			for(var i=0;i<powerPills.length;i++)
			{
				if(powerPills[i].distance < minDistance)
					minLocation = i;
			}

			var sub = [],
			    currentNode = powerPills[minLocation];

			for(currentNode=currentNode.next();currentNode!==lastNode;currentNode=currentNode.next())
				sub.push(currentNode.id);
			sub.push(currentNode.id)

			route = sub.concat(route);
			lastNode = powerPills[minLocation];
			powerPills = powerPills.skip(minLocation);
			this.resetDistances();
			lastNode.setDistance();
		}
		var sub = this.findRoute(this.startNode,lastNode);
		sub.pop();
		route = sub.concat(route);

		this.fullPath = route;

		return route;
	};

	// original idea
	this.getFullPath = function(){
		// let's organize the powerPills by distance
		this.findRoute();
		this.powerPills.sort(function(a,b){return b.distance-a.distance});

		// get the full path by connecting the dots
		var fullPath = [];
		for(var p=0; p <= this.powerPills.length;p++)
		{
			console.log('step '+(p+1)+'/'+(this.powerPills.length+1));
			var sub = this.findRoute(
				p ? this.powerPills[p-1] : this.startNode,
				p < this.powerPills.length ? this.powerPills[p] : this.exitNode
			);
			sub.pop();
			fullPath = fullPath.concat(sub);
			//console.log(sub);
		}
		fullPath.push(this.exitNode.id);
		this.fullPath  = fullPath;
		return fullPath;
	};

	// check if it is good to go
	this.validatePath = function(){

		for(var i=1;i<this.fullPath.length;i++)
		{
			if(this.nodes[this.fullPath[i-1]].exits.indexOf(this.fullPath[i]) == -1 )
				return false;
		}

		if(this.fullPath[0]!=this.startNode.id)
			return false;

		if(this.fullPath[this.fullPath.length-1]!=this.exitNode.id)
			return false;

		for(var i=0;i<this.powerPills.length;i++)
		{
			if(this.fullPath.indexOf(this.powerPills[i].id) == -1 )
				return false;
		}

		return true;

	};

	// discover the graph
	this.discover = function(){
		if(!this.initialized)
		{
			this.initialized = true;
			API.getStart(this,this.addNode.bind(this));
			return false;
		}
		if(!this.discoveryQueue.length)
		{
			console.log('routing... [among '+this.nodeCount+' nodes]');
			var fullPath = this.getFullPath(),
			    valid = this.validatePath();

			if(valid)
			{
				console.log(this.name+" done in "+fullPath.length+" steps");
				API.sendHighScore(this,fullPath);
			}
			else
				console.log('Dude, you messed up...');

			return true;
		}

		var next = this.discoveryQueue.shift();
		if(typeof(this.nodes[next])=='undefined')
			API.getNode(this,next,this.addNode.bind(this),this.nodeFail.bind(this,next));
		else
			this.discover();
	};

	this.resetDistances = function(){
		for(var n in this.nodes)
		{
			if(this.nodes[n] instanceof Node)
				this.nodes[n].distance = Infinity;
		}
	};

	this.findRoute = function(start,end){

		start = start || this.startNode;
		end = end || this.exitNode;

		//reset distances
		this.resetDistances();
		
		end.setDistance(0);

		var exitRoute = [];
		var node = start;
		var steps = 0;
		while(node !== end && steps++ < this.nodeCount)
		{
			exitRoute.push(node.id);
			node = this.nodes[node.exitPath];
		}
		exitRoute.push(node.id);

		return exitRoute;
	};
};

Maze.next = function(data){
	var level = JSON.parse(data);
	console.log(level);
	if(level.MessageType=='Error')
		return false;
	level = level.MessageContent.split("'")[1];

	if(level)
	{
		delete Maze.active;
		Maze.active = new Maze(level);
		Maze.active.discover();
	}
}


Maze.active = new Maze("thedaddy");
Maze.active.discover();
