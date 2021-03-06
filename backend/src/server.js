const express = require("express");
const app = express();
var mysql = require('mysql');
const cors = require('cors')
var { Matcher } = require("./components/Matcher.js")
var { companyAccountCreator } = require("./components/Signup-process.js")
var {userSignup} = require("./components/userSignup.js");
var pass = require("./config/pass.js")
var ws = require("nodejs-websocket")
var con = mysql.createConnection({
  host: "localhost",
  user: "daniel.rosel",
  password: pass,
  database: 'coffee_time',
  port: 3306,
});


con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});


class client {
	constructor(con) {
		this.con = con
	}	
	setUUID(uuid) {this.uuid = uuid;}
	getUUID() {return this.uuid;}
	setCUID(cuid) {this.cuid = cuid;}
	setITRS(interests) {this.interests = interests;}
	getITRS() {return this.interests;}
	getCUID(cuid) {return this.cuid;}
	getCON() {return this.con;}
	
}


/*
 * WEBSOCKET
 */

function broadcast(data) {

	for(var user in pool) {	
		user = pool[user]
		if(user != null) {
			var cn = user.getCON();
			if(cn.readyState == 1) {
				cn.sendText(data);
			}
		}
	}
}

var pool = [];

function updateView() {

	var size = Object.keys(pool).length;

	for(var p in pool) {
		
	}
		
	return {"status":"success", "data": {"currently_on":size}}
}

var server = ws.createServer(function (conn) {
	var cli = new client(conn)
	console.log("New connection")
	broadcast(JSON.stringify(updateView()));
	conn.on("text", function (str) {
		str = JSON.parse(str);
		console.log(str);
		switch(str['event']) {
			case "id_self":				
				cli.setUUID(str['data']['UUID']);
				cli.setCUID(str["data"]["CUID"]);
				var id = cli.getUUID();
				pool.push(cli);
				conn.sendText("helo "+id) // yes helo not hello
				break;
			case "pvd_interests":
				cli.setITRS(str["data"]["ITRS"])			
				broadcast(JSON.stringify(getAllAvalibleInterests()));
				break;

			case "send_to":
				var id = str["data"]["to"], payload = str["data"]["msg"];			
				console.log("sending message to "+id);
				var message = {"event":"com_rec", "data":{"origin":cli.getUUID(), "message":payload}}
				var target = null;
				for(var p in pool) {
					p = pool[p]
					if(p!=null){
						if(p.getUUID() == id) {
							target = p.getCON();
						}
					} else {}
				}
				console.log(target);
				target.sendText(JSON.stringify(message));
//				((pool[id]).getCON()).sendText(JSON.stringify(message));
				break;
		}
		console.log("Received "+str)

	    })
	conn.on("close", function (code, reason) {
        	console.log("Connection closed")		

		for(var e in pool) {
		
			var ps = e;
			e = pool[e];
			if(e != null) {
				if(e.getUUID() == cli.getUUID()) {
					pool[ps] = null;
				}
			}
		}	
		broadcast(JSON.stringify(getAllAvalibleInterests()));
		
	})
}).listen(8001)




/*
 * ENDPOINTS
 */

app.use(express.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/add/company/:name", (req, res) => {
	let s = new companyAccountCreator(req.params.name);
	s.loadDatabaseConnection(con);
	s.createCompanyInstance();
	res.json({"status":"success", "payload":{"company_UID":s.getUID()}});
})

app.post("/add/user", (req, res) => {
	const {name, cc, interests} = req.body;
	console.log(name, cc, interests);
	var u = new userSignup(name, cc, interests, con);
	u.insert(res);

})

app.get("/stat", (req, res) => {	
	res.send("running");		
})



app.get("/match/:uuid/:companyCode", (req, res) => {
	var m = new Matcher(req.params.uuid, req.params.companyCode);
	m.match(res, pool)
})


app.get("/match_random/:uuid/:companyCode", (req, res) => {
	var m = new Matcher(req.params.uuid, req.params.companyCode);
	res.send(m.randomMatch());
})


app.post("/add/topic/:topic", (req, res) => {
	var time = ( new Date().getTime() )
	console.log(time)
	var sql = `insert into trending_current_topics (topic, time) values ('${req.params.topic}', '${time}')`
	for(var c in pool) {
		(c.getCON()).sentText(JSON.stringify({"event":"update_buble", "data": {"topic":req.params.topic}}))
	}
	con.query(sql, (e, r, f) => {
		if(e) {} else {res.json({"status":"success"})}
	})
})

app.get("/get/all-connected", (req, res) => {
	var size = Object.keys(pool).length;

	for(var p in pool) {
		
	}
		
	res.json({"status":"success", "data": {"currently_on":size}})
})


function getAllAvalibleInterests() {

	var count = 0;
	var all = []
	for(var c in pool) {
		c=pool[c]
		if(c!=null) {		
			count += 1;
			console.log(c);
			c=c.getITRS()	
			for(var i in c) {
				i = c[i]
				if(!all.includes(i)) {
					all.push(i);	
				}
			}	
		}else {
			
		}
	} 	
	return {"status":"success", "event":"update_buble", "data": {"list":all,"size":count}}
}


app.get("/get/avalible-topics", (req, res) => {
	res.send(getAllAvalibleInterests())
})

app.get("/get/trending-topics", (req, res) => {
	var minTime = ( new Date().getTime() ) - 86400000;
	console.log(minTime)
	var topics = [];
	var sql = `select * from trending_current_topics`
	con.query(sql, (e, r, f) => {
		
		for(var n in r) {
			n = r[n]
			if(parseInt(n.time) > minTime) {
				if(Math.random() < 0.5 && topics.length < 10) {
		
					console.log(n.topic)
					topics.push(n.topic);
				
				}
			}
		}
		res.json({"topics": topics})
	})
})



app.get("/login/:code",  (req, res) => {
	var auth = false;
	var sql0 = `select * from authentication_codes`
	async function r() {
	var p = new Promise(function(resolve, reject) {con.query(sql0, (e, r ,f) => {
		
		for(var n in r) {
			n = r[n];			
			var sql = `select * from company_members_${n.code} where AUTH_KEY="${req.params.code}"`
			new Promise(function(re, rj){ 
				con.query(sql, (e1, r1, f1) => {
				//console.log(r1[0])
				if(r1.length > 0 && !auth) {
					res.json({"auth":"success", "data": {"uuid":r1[0].UUID, "company_uid":n.code, "interests":(r1[0].interests).split(", ")}})
					auth = true;
					console.log("match")
				
				}
				console.log("doing")
				re()
			})
			})
	
		}		
		
	})})
	var re = await p;
	console.log(re)
		console.log("done")
	}
	r()
	// whatever lol - not enough time anyway
})





app.get("/about/:uuid/:company", (req, res) => {
	var sql = `select * from company_members_${req.params.company} where UUID="${req.params.uuid}"`
	con.query(sql, (e, r, f) => {
		console.log(r)
		if(r.length <= 0) {
			res.json({"status": "fail"})
		}
		else {
			r= r[0]
			res.json({"status": "success", "data": {"name":r.name, "contact": r.contact, "interests": r.interests}})
		}
	})
})


app.listen(4891, () => console.log("server is running on port 8000"));
