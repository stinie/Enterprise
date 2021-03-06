// actually just state for one map

function Game() {
	this.toAdd = []; // objects to be added end of frame
	this.toRemove = []; // objects to be removed at the end of the next frame
	// the game starts at level 1 - 1
	this.map = Map.get(window.location.hash.length>4 ? "random" : "first");
	var objects = this.map.objects;
	for (var i=0; i<objects.length; ++i) {
		var obj = objects[i];
		switch (obj.type) {
			case 'enemy': 
				this.addObject(new Enemy(obj.x, obj.y, obj.config)); 
				break;
			default: Test.die("Unknown object type: "+obj.type);
		}
	}
	
	Test.assert('spawnPoint' in this.map, "map must have spawn point "+this.map);
	Test.assert(this.map.spawnPoint.x > 0 || this.map.spawnPoint.y > 0, "spawn point 0,0 is useless");
	var size = this.map.squadSize;
	Test.assert(size >= 1 && size <= 4, "squad size is 1~4");
	for (var i=0; i<4; i++) {
		if (i < size) {
			this.addPlayer(new Player(i)); // create player
			$('#c'+(i+1))[0].className = 'selected character'; // show as selected
		} else {
			$('#c'+(i+1))[0].style.display = 'none';
		}
	}
	//this.walkPlayers(this.map.spawnPoint);
}

Game.prototype = {
    map: null, // the map object for the active game
    
    players: [], // players are both in objects and players
    
    /** all gameobj-derived objects (sprites)
     * 
     * NB! Objects in this array must be sorted by screen y-coordinate 
     * to ensure proper "z-index" when painted
     * every object has this.screenZIndex for sorting
     * keeping this array sorted is perf improvement
     */
    objects: [], 
    
    toAdd: null, // array to hold elements to be added at the end of a frame
    toRemove: null, // array to hold elements to be removed at the end of a frame
    
	lastAiTime: 0, // last time the AI logic was called (we dont want to do this every frame)
	aiDelay: Config.aiDelay, // time between calls to the ai logic
	
	selectedCharacter: 1|2|4|8, // the currently active character(s), flags (1,2,4,8). all players selected by default at start (required or they're not placed on the map ;)
	
	crashTest: false, // testing whether game crashed between frames
	crashMessage: false, // shown crashed message?
	
	isSelected: function(player){
		return player.flag & this.selectedCharacter;
	},
	
	// instant
    movePlayers: function(point) {
        for(var i=0; i < this.players.length; i++) {
            if (this.isSelected(this.players[i])) this.players[i].setOrigin(point.x, point.y);
        }
    },
    
    // animated
    walkPlayers: function(point) {
        for (var i=0; i< this.players.length; ++i) {
			if (this.isSelected(this.players[i])) {
	            var row = Math.floor(i/4);
	            
				this.players[i].walkTo({
				    x:point.x + (i&1 ? row*2*Math.random()+1.15 : 0),
				    y:point.y + (i&2 ? row*2*Math.random()+1.15 : 0)
				});
				//console.log("switching to walk now");
				this.players[i].model.switchAnimator('walk'); // will not switch if already doing this animation
			}
		}		
    },
	// relative to current position
    walkPlayersRelative: function(vector) {
        for(var i=0; i < this.players.length; i++) {
			if (this.isSelected(this.players[i])) {
				var target = {x:this.players[i].origin.x+vector.x, y:this.players[i].origin.y+vector.y};
	            this.players[i].walkTo(target);
				this.players[i].model.switchAnimator('walk'); // will not switch if already doing this animation
			}
        }
    },
    
    fire: function(point) {
        for (var i=0; i< this.players.length; ++i) {
			if (this.isSelected(this.players[i])) this.players[i].fire(point);
		}		
    },
    
    addPlayer: function(player) {
        this.players.push(player);
        this.addObject(player);
        player.setOrigin(this.map.spawnPoint.x+ Math.random(),this.map.spawnPoint.y + Math.random());    	
    },

    addObject: function(obj){
        this.toAdd.push(obj);
        obj.game = this;
    },
    removeObject: function(obj){
    	// only remove once... objects can be removed multiple times in the same loop (like two enemies killing the same player)
    	if (this.toRemove.indexOf(obj) == -1) this.toRemove.push(obj);
    	// do not remove the game reference here, the object might still be processed and would need it
    },
    
    // all stuff happens here (called from timer in ui.js)
    frame: function() {
		// should we call the ai logic?
		var now = Date.now ? Date.now() : +new Date;
		var callAi = (now - this.lastAiTime > this.aiDelay);
		if (callAi) this.lastAiTime = now;
		
		var o, end = this.objects.length;
		for (var i=0; i < end; i++) {
			Test.assert(this.objects.length == end, "should only use addObject and removeObject to change the objects array...");
			o = this.objects[i];

            // ai
			if (callAi && o instanceof Enemy) o.ai(this);	

			// "physics"
			if (o.velocity.x || o.velocity.y) {
		    	if (o.solid) {
					// move the object based on its velocity
					// dont allow it to move into solid cells
					var fromCellX = Math.floor(o.origin.x);
					var fromCellY = Math.floor(o.origin.y);
					var toCellX = Math.floor(o.origin.x + o.velocity.x);
					var toCellY = Math.floor(o.origin.y + o.velocity.y);

					if (
						this.map.tileGrid[toCellY] && 
						this.map.tileGrid[toCellY][toCellX] &&
					  	this.map.tileGrid[toCellY][toCellX].collides
					) {
						//console.log("target blocked")
						// cell blocked, do something
						// we take away velocity in either direction
						if (this.map.tileGrid[fromCellY][toCellX].collides) o.velocity.x = 0;
						if (this.map.tileGrid[toCellY][fromCellX].collides) o.velocity.y = 0;
						// in case only the diagonal target tile is taken, clear one direction anyways
						if (o.velocity.x && o.velocity.y) o.velocity.y = 0; 

						toCellX = Math.floor(o.origin.x + o.velocity.x);
						toCellY = Math.floor(o.origin.y + o.velocity.y);
						//Test.reject(this.map.tileGrid[toCellY][toCellX].collides, "the target should not be blocked anymore");
						if (this.map.tileGrid[toCellY][toCellX].collides) continue;

	    				o.collision(); // tell object it has collided
					}
				} 
				o.setOrigin(o.origin.x + o.velocity.x, o.origin.y + o.velocity.y);
				// the active animator is called at mapui
				//console.log(o.velocity.x+","+o.velocity.y+" "+o.origin.x+","+o.origin.y)
			}

			// enemy too close? and alive...? :)
			if (o instanceof Enemy && o.health > 0) {
				for (var j=0; j<4; ++j) {
					var p = this.players[j];
					if (p && vector.distance(o.origin, p.origin) < 1) {
						// boom!
						o.collision(p);
					}
				}
			}
			
			// rocket hitting anyone?
			if (o instanceof Rocket) {
				for (var j=0; j<this.objects.length; ++j) {
					var t = this.objects[j];
					if (t && t instanceof Enemy && t.solid && vector.distance(o.origin, t.origin) < 1) {
						// boom!
						o.collision(t);
					}
				}
			}
    	}
		Test.assert(this.objects.length == end, "should only use addObject and removeObject to change the objects array... (2)");
    	
    	// cleanup
    	for (var i=0; i<this.toRemove.length; ++i) {
    		var t = this.toRemove[i];
    		Test.assert(this.toRemove.indexOf(t, i+1) == -1, "objects should only be removed once..."+i+" "+this.toRemove.indexOf(t, i+1));
    		var pos = this.objects.indexOf(t);
    		Test.assert(pos > -1, "object should be added to the pool");
    		// the lookup is required. you cannot put id's in the trash
    		// the id's will be ever changing.
    		var o = this.objects.splice(pos, 1)[0];
    		Test.assert(o === t, "this is what we were removing");
    		Test.assert(!(o instanceof Array), "splice returns an array, we want the removed object");
    		o.game = null; // remove reference
    		// remove player from players array
    		if (o instanceof Player) this.players.splice(this.players.indexOf(o), 1);

    		Test.assert(this.objects.indexOf(t) == -1, "every object should only be added to the pool once");
    	}
    	// and take out the trash
    	this.toRemove.length = 0;
    	
    	// init
    	for (var i=0; i<this.toAdd.length; ++i) {
    		this.objects.push(this.toAdd[i]);	
    	}
    	this.toAdd.length = 0;
    },
    
	toString: function(){
		return "Game["+this.objects.length+"objs]";
	},

0:0};
