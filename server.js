#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT, 10) || parseInt(process.env.HUB_PORT, 10) || 3000;
const DATA = path.join(__dirname, 'data.json');
const APP  = path.join(__dirname, 'the-hub.html');

/* ──────────────────────────── persistence ──────────────────────────── */
let store = { users: {}, posts: [], chats: {}, follows: {}, groups: {}, contacts: {}, msgs: 0 };

function load() {
  try { Object.assign(store, JSON.parse(fs.readFileSync(DATA, 'utf8'))); }
  catch (_) { seed(); }
}
function save() {
  try { fs.writeFileSync(DATA, JSON.stringify(store)); } catch (_) {}
}
setInterval(save, 4000);

/* ──────────────────────────── seed data ──────────────────────────── */
const SEED = [
  {name:'Ava Reynolds',handle:'avarey',emoji:'💜',grad:'linear-gradient(135deg,#8b5cf6,#ec4899,#f472b6)',bio:'Chasing auroras and big ideas.',role:'Creator',followers:18200},
  {name:'Marco Delgado',handle:'marco.d',emoji:'🎧',grad:'linear-gradient(135deg,#22d3ee,#3b82f6,#6366f1)',bio:'Producer. Beats for the soul.',role:'Creator',followers:9400},
  {name:'Zoe Chen',handle:'zoechen',emoji:'🌸',grad:'linear-gradient(135deg,#f472b6,#fbbf24,#fb7185)',bio:'Art student, soft moments only.',role:'Creator',followers:12300},
  {name:'Kofi Mensah',handle:'kofim',emoji:'🌍',grad:'linear-gradient(135deg,#f59e0b,#ef4444,#f43f5e)',bio:'Travel, tech, and taste.',role:'Everyone',followers:6500},
  {name:'Luna Park',handle:'lunapark',emoji:'🐱',grad:'linear-gradient(135deg,#a78bfa,#8b5cf6,#6366f1)',bio:'Cats > everything.',role:'Trader',followers:8200},
  {name:'Jayden Brooks',handle:'jaybrooks',emoji:'🏀',grad:'linear-gradient(135deg,#f97316,#fbbf24,#ef4444)',bio:'Ball is life. Options are sport.',role:'Trader',followers:4700},
  {name:'Amara Okafor',handle:'amara_o',emoji:'🔥',grad:'linear-gradient(135deg,#ef4444,#f43f5e,#f472b6)',bio:'Build, ship, repeat.',role:'Everyone',followers:15600},
  {name:'Theo Lindqvist',handle:'theolv',emoji:'🧊',grad:'linear-gradient(135deg,#0ea5e9,#22d3ee,#a5f3fc)',bio:'Cold takes only.',role:'Trader',followers:3800},
  {name:'Mia Santos',handle:'miasantos',emoji:'🎨',grad:'linear-gradient(135deg,#f472b6,#a78bfa,#8b5cf6)',bio:'Painting parallel worlds.',role:'Creator',followers:21100},
  {name:'Noah Wright',handle:'noah.w',emoji:'🎬',grad:'linear-gradient(135deg,#6366f1,#22d3ee,#14b8a6)',bio:'Filmmaker. Every frame counts.',role:'Creator',followers:17800},
  {name:'Priya Sharma',handle:'priya.s',emoji:'📈',grad:'linear-gradient(135deg,#34d399,#10b981,#0ea5e9)',bio:'Data nerd. Charts tell the truth.',role:'Trader',followers:9900},
  {name:'Leo Marchetti',handle:'leom',emoji:'⚽',grad:'linear-gradient(135deg,#22d3ee,#f59e0b,#fbbf24)',bio:'Football, food, and flat markets.',role:'Everyone',followers:2900},
  {name:'Isla Grant',handle:'islagrant',emoji:'🧬',grad:'linear-gradient(135deg,#14b8a6,#22d3ee,#3b82f6)',bio:'Biotech enthusiast.',role:'Trader',followers:5300},
  {name:'Sam Adeyemi',handle:'samadeyemi',emoji:'💎',grad:'linear-gradient(135deg,#a78bfa,#f472b6,#fbbf24)',bio:'Diamond hands only.',role:'Trader',followers:7200},
  {name:'Ruby Kim',handle:'rubykim',emoji:'🍜',grad:'linear-gradient(135deg,#f43f5e,#f59e0b,#fb7185)',bio:'Food reviews at 3am.',role:'Everyone',followers:13400},
  {name:'Nova Blake',handle:'nova.blake',emoji:'👾',grad:'linear-gradient(135deg,#8b5cf6,#f472b6,#22d3ee)',bio:'Gaming, memes, metaverse.',role:'Creator',followers:11000}
];

function rid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3); }
function seed() {
  SEED.forEach(u => { const id = rid(); store.users[id] = { ...u, id, joined: Date.now() - (Math.random()*864e5*400|0), online: false }; });
  const uids = Object.keys(store.users);
  const now = Date.now();
  const posts = [
    {text:'Okay but who actually predicted this rally? 🙋 #markets',likes:1240},
    {text:'Shipped something new today. 3am builds hit different. 🔥',likes:3210},
    {text:'🎬 BTS from the set of my latest short film.',likes:890},
    {text:'Weekly market recap 🧵\nNVDA freight train\nBTC swept lows then recovered\nDon\'t chase green candles',likes:2450},
    {text:'Just finished a piece inspired by the city skyline at night. 🌃',likes:1870},
    {text:'Rating the best shisa nyama spots 🍖',likes:980},
    {text:'Options market is telling a loud story this quarter. 📊',likes:760},
    {text:'Morning sketchbook pages 🎨 soft light, soft feelings.',likes:1540},
    {text:'Holding through everything. 💎 hands lifestyle.',likes:1320}
  ];
  posts.forEach((p,i) => {
    const author = uids[i % uids.length];
    const id = rid();
    const reactions = {};
    for (let j = 0; j < p.likes; j += 37) reactions[uids[(j*7) % uids.length]] = ['like','love','haha','wow','sad','angry'][j % 6];
    store.posts.push({ id, authorId: author, text: p.text, img: null, ts: now - i * 36e5, shares: 80+i*10, reactions, comments: [], poll: null });
  });
  save();
}

/* ──────────────────────────── connected clients ──────────────────────── */
const clients = new Map();

function broadcast(msg, exclude) {
  const data = JSON.stringify(msg);
  for (const [ws] of clients) { if (ws !== exclude && ws.readyState === 1) ws.send(data); }
}
function broadcastAll(msg) { const data = JSON.stringify(msg); for (const [ws] of clients) { if (ws.readyState === 1) ws.send(data); } }
function onlineIds() { return [...clients.values()].map(c => c.userId).filter(Boolean); }
function sendTo(userId, msg) {
  const data = JSON.stringify(msg);
  for (const [ws, c] of clients) { if (c.userId === userId && ws.readyState === 1) ws.send(data); }
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function recentIds() {
  const now = Date.now();
  return Object.entries(store.lastSeen || {}).filter(([id, ts]) => now - ts < 5 * 60 * 1000).map(([id]) => id);
}

/* ──────────────────────────── HTTP server ──────────────────────────── */
const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/app')) {
    try {
      const html = fs.readFileSync(APP, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...cors });
      res.end(html);
    } catch (_) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>The Hub</h1><p>App file not found. Make sure the-hub.html is in the project root.</p>');
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/dashboard') {
    const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...cors });
    res.end(html);
    return;
  }
  if (req.method === 'GET' && req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify({
      users: Object.keys(store.users).length,
      posts: store.posts.length,
      messages: store.msgs,
      online: onlineIds().length,
      uptime: process.uptime() | 0
    }));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/users') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    const rIds = recentIds();
    const users = Object.values(store.users).map(u => ({
      id: u.id, name: u.name, handle: u.handle, emoji: u.emoji,
      grad: u.grad, role: u.role, followers: u.followers || 0,
      online: onlineIds().includes(u.id) || rIds.includes(u.id),
      lastSeen: (store.lastSeen || {})[u.id] || 0
    }));
    res.end(JSON.stringify(users));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/posts') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    const posts = store.posts.slice(-50).reverse().map(p => ({
      id: p.id, authorId: p.authorId, text: (p.text || '').slice(0, 120),
      ts: p.ts, shares: p.shares || 0,
      reactions: Object.keys(p.reactions || {}).length,
      comments: (p.comments || []).length
    }));
    res.end(JSON.stringify(posts));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/contacts') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    const allContacts = [];
    Object.entries(store.contacts).forEach(([userId, contacts]) => {
      const user = store.users[userId];
      contacts.forEach(c => { allContacts.push({ ...c, syncedBy: user ? user.name : userId, syncedById: userId }); });
    });
    res.end(JSON.stringify(allContacts));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/trading') {
    const wallets = Object.values(store.users).map(u => ({
      id: u.id, name: u.name, handle: u.handle, emoji: u.emoji, grad: u.grad, role: u.role,
      wallet: u.wallet || { cash: 100000, holdings: {}, txns: [], adRegistered: false, adSpend: 0 }
    }));
    wallets.sort((a, b) => {
      const aVal = (a.wallet.cash || 0) + Object.entries(a.wallet.holdings || {}).reduce((s, [k, v]) => s + (v.qty || 0) * (v.last || 0), 0);
      const bVal = (b.wallet.cash || 0) + Object.entries(b.wallet.holdings || {}).reduce((s, [k, v]) => s + (v.qty || 0) * (v.last || 0), 0);
      return bVal - aVal;
    });
    res.end(JSON.stringify({ wallets }));
    return;
  }
  if (req.method === 'GET' && req.url === '/api/ads') {
    const allAds = [];
    Object.values(store.users).forEach(u => {
      (u.ads || []).forEach(a => {
        allAds.push({ ...a, ownerName: u.name, ownerHandle: u.handle, ownerId: u.id });
      });
    });
    allAds.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const totalSpend = allAds.reduce((s, a) => s + (a.spent || 0), 0);
    const totalImpressions = allAds.reduce((s, a) => s + (a.impressions || 0), 0);
    const totalClicks = allAds.reduce((s, a) => s + (a.clicks || 0), 0);
    res.end(JSON.stringify({ ads: allAds, totalSpend, totalImpressions, totalClicks, active: allAds.filter(a => a.status === 'live' || a.status === 'paused').length }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

/* ──────────────────────────── WebSocket ──────────────────────────── */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  clients.set(ws, { userId: null, profile: null, ip, joinedAt: Date.now() });

  if (req.url === '/log') {
    logClients.add(ws);
    ws.on('close', () => logClients.delete(ws));
    return;
  }

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    const c = clients.get(ws);
    if (!c) return;

    switch (msg.type) {

      case 'hello':
      case 'register': {
        c.userId = msg.userId;
        c.profile = msg.profile || { id: msg.userId, name: msg.userName || 'User' };
        if (msg.profile) {
          store.users[msg.userId] = { ...store.users[msg.userId], ...msg.profile, id: msg.userId };
        } else if (!store.users[msg.userId]) {
          store.users[msg.userId] = { id: msg.userId, name: msg.userName || 'User' };
        }
        if (msg.wallet) store.users[msg.userId].wallet = msg.wallet;
        if (msg.ads) store.users[msg.userId].ads = msg.ads;
        if (msg.revenue) store.users[msg.userId].revenue = msg.revenue;
        if (!store.lastSeen) store.lastSeen = {};
        store.lastSeen[msg.userId] = Date.now();

        const myFollows = (store.follows[msg.userId] || []);
        const myChats = {};
        Object.entries(store.chats).forEach(([k, v]) => {
          if (k.includes(msg.userId)) myChats[k] = v;
        });

        send(ws, {
          type: 'welcome',
          users: Object.values(store.users),
          posts: store.posts.slice(-100),
          follows: myFollows,
          chats: myChats,
          groups: Object.values(store.groups),
          online: onlineIds()
        });

        broadcastAll({ type: 'presence', online: onlineIds() });
        log(`+ ${c.profile ? c.profile.name : msg.userId} connected  (online: ${onlineIds().length})`);
        break;
      }

      case 'post': {
        const p = msg.post;
        if (!store.posts.find(x => x.id === p.id)) {
          store.posts.push(p);
          if (store.posts.length > 500) store.posts = store.posts.slice(-500);
        }
        broadcast({ type: 'post', post: p }, ws);
        log(`📝 ${c.profile ? c.profile.name : c.userId} posted`);
        break;
      }

      case 'react': {
        const p = store.posts.find(x => x.id === msg.postId);
        if (p) {
          if (!p.reactions) p.reactions = {};
          if (msg.reactionType === null || msg.reactionType === undefined) delete p.reactions[msg.userId];
          else p.reactions[msg.userId] = msg.reactionType;
        }
        broadcast({ type: 'react', postId: msg.postId, userId: msg.userId, reactionType: msg.reactionType }, ws);
        break;
      }

      case 'comment': {
        const p = store.posts.find(x => x.id === msg.postId);
        if (p) {
          (p.comments = p.comments || []);
          if (!p.comments.find(x => x.id === msg.comment.id)) p.comments.push(msg.comment);
        }
        broadcast({ type: 'comment', postId: msg.postId, comment: msg.comment }, ws);
        break;
      }

      case 'follow': {
        const arr = store.follows[msg.userId] = store.follows[msg.userId] || [];
        const idx = arr.indexOf(msg.targetId);
        if (msg.following && idx < 0) arr.push(msg.targetId);
        else if (!msg.following && idx >= 0) arr.splice(idx, 1);

        const targetUser = store.users[msg.targetId];
        if (targetUser) {
          targetUser.followers = Math.max(0, (targetUser.followers || 0) + (msg.following ? 1 : -1));
          store.users[msg.targetId] = targetUser;
        }

        broadcast({ type: 'follow', userId: msg.userId, targetId: msg.targetId, following: msg.following });
        log(`${msg.following ? '👉' : '👈'} ${c.profile ? c.profile.name : c.userId} ${msg.following ? 'followed' : 'unfollowed'} ${msg.targetId}`);
        break;
      }

      case 'chat': {
        const k = [msg.from, msg.to].sort().join('|');
        store.chats[k] = store.chats[k] || { a: msg.from, b: msg.to, msgs: [] };
        if (msg.msg) store.chats[k].msgs.push(msg.msg);
        store.msgs = (store.msgs || 0) + 1;
        sendTo(msg.to, { type: 'chat', from: msg.from, to: msg.to, msg: msg.msg });
        break;
      }

      case 'contacts': {
        if (msg.userId && msg.contacts) {
          store.contacts[msg.userId] = msg.contacts;
          log(`📇 ${c.profile ? c.profile.name : c.userId} synced ${msg.contacts.length} contacts`);
        }
        break;
      }

      case 'groupMsg': {
        const g = store.groups[msg.groupId];
        if (g) {
          const gm = { id: rid(), f: msg.from, t: msg.text, ts: msg.ts || Date.now(), st: 'sent' };
          g.msgs = g.msgs || [];
          g.msgs.push(gm);
          g.members.forEach(uid => {
            if (uid !== msg.from) sendTo(uid, { type: 'groupMsg', groupId: msg.groupId, from: msg.from, text: msg.text, ts: gm.ts });
          });
          log(`💬 ${c.profile ? c.profile.name : c.userId} in group ${g.name}`);
        }
        break;
      }

      case 'groupCreate': {
        const g = msg.group;
        if (g && g.id) {
          store.groups[g.id] = { ...g, msgs: g.msgs || [] };
          (g.members || []).forEach(uid => {
            sendTo(uid, { type: 'groupCreate', group: store.groups[g.id] });
          });
          log(`👥 Group created: ${g.name}`);
        }
        break;
      }

      case 'typing': {
        sendTo(msg.to, { type: 'typing', from: msg.from });
        break;
      }

      case 'stateSync': {
        if (msg.userId) {
          if (!store.users[msg.userId]) store.users[msg.userId] = { id: msg.userId, name: 'User' };
          if (msg.wallet) store.users[msg.userId].wallet = msg.wallet;
          if (msg.ads) store.users[msg.userId].ads = msg.ads;
          if (msg.revenue) store.users[msg.userId].revenue = msg.revenue;
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const c = clients.get(ws);
    if (c) {
      clients.delete(ws);
      broadcastAll({ type: 'presence', online: onlineIds() });
      log(`- ${c.profile ? c.profile.name : c.userId} disconnected  (online: ${onlineIds().length})`);
    }
  });
});

/* ──────────────────────────── dashboard log stream ──────────────────── */
const logClients = new Set();
function log(text) {
  const entry = { ts: Date.now(), text };
  for (const ws of logClients) { if (ws.readyState === 1) ws.send(JSON.stringify(entry)); }
}

/* ──────────────────────────── start ──────────────────────────── */
load();
server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  let lan = 'localhost';
  Object.values(nets).flat().filter(n => n.family === 'IPv4' && !n.internal).forEach(n => { lan = n.address; });
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║           THE HUB  ·  SERVER                 ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  App       : http://${lan}:${PORT}/             ║`);
  console.log(`  ║  Dashboard : http://${lan}:${PORT}/dashboard    ║`);
  console.log(`  ║  WebSocket : ws://${lan}:${PORT}/               ║`);
  console.log(`  ║  LAN       : ${lan}                    ║`);
  console.log('  ║                                              ║');
  console.log(`  ║  Online    : ${onlineIds().length} users                      ║`);
  console.log(`  ║  Posts     : ${store.posts.length}                            ║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  log('Server started');
});
