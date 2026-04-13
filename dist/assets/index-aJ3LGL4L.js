(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const n of i)if(n.type==="childList")for(const o of n.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(i){const n={};return i.integrity&&(n.integrity=i.integrity),i.referrerPolicy&&(n.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?n.credentials="include":i.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(i){if(i.ep)return;i.ep=!0;const n=t(i);fetch(i.href,n)}})();const X=1,te=.1,$=te*te,Se=.05,Be=.5,se=256,L=2e5,V=48,ie=180,xe=1e-4,Pe=1e4,_e=0,Me=1,Ie=2,Ee=3,ke=4,C="EXACT",he="BARNES_HUT",pe="HYBRID",Ae=1e3,ne=1,Te=.01,Le=1e-4,Ue=.05,Ce=.005,Fe=.01,Z=1e3;function k(l,e,t,s=!1){const i=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|(s?GPUBufferUsage.COPY_SRC:0);return l.createBuffer({size:e,usage:i,label:t})}function Y(l,e,t){return l.createBuffer({size:e,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,label:t})}function oe(l,e,t){return l.createBuffer({size:e,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,label:t})}function I(l,e,t,s=0){l.queue.writeBuffer(e,s,t)}const re=4294967295;class D{cx=0;cy=0;totalMass=0;size=0;minX=0;minY=0;maxX=0;maxY=0;bodyIdx=-1;children=[null,null,null,null];isLeaf=!0;constructor(e,t,s,i){this.minX=e,this.minY=t,this.maxX=s,this.maxY=i,this.size=(s-e)/2}}class fe{theta=Be;G_val=X;epsilon2=$;computeForces(e){const t=e.length,s=new Float32Array(t*2);if(t===0)return s;let i=1/0,n=1/0,o=-1/0,a=-1/0;for(const d of e)d.position[0]<i&&(i=d.position[0]),d.position[1]<n&&(n=d.position[1]),d.position[0]>o&&(o=d.position[0]),d.position[1]>a&&(a=d.position[1]);const r=(o-i+a-n+1)*.1;i-=r,n-=r,o+=r,a+=r;const h=Math.max(o-i,a-n),c=(i+o)/2,p=(n+a)/2;i=c-h/2,o=c+h/2,n=p-h/2,a=p+h/2;const v=new D(i,n,o,a);for(let d=0;d<t;d++)this._insert(v,e[d],d);this._computeCOM(v);for(let d=0;d<t;d++){const[m,g]=this._forceOn(e[d].position,e[d].mass,v,d);s[d*2]=m,s[d*2+1]=g}return s}_insert(e,t,s){if(e.isLeaf&&e.bodyIdx===-1){e.bodyIdx=s,e.cx=t.position[0],e.cy=t.position[1],e.totalMass=t.mass;return}if(e.isLeaf&&e.bodyIdx>=0){e.isLeaf=!1;const i={pos:[e.cx,e.cy],mass:e.totalMass,bodyIdx:e.bodyIdx};e.bodyIdx=-1,this._ensureChildren(e),this._insertBodyIntoChild(e,i.pos,i.mass,i.bodyIdx)}this._insertBodyIntoChild(e,t.position,t.mass,s)}_insertBodyIntoChild(e,t,s,i){const n=this._quadrant(e,t[0],t[1]);if(!e.children[n]){const[a,r,h,c]=this._childBounds(e,n);e.children[n]=new D(a,r,h,c)}const o={id:"",name:"",type:"asteroid",position:t,velocity:[0,0],mass:s,radius:0,color:"#fff"};this._insert(e.children[n],o,i)}_ensureChildren(e){for(let t=0;t<4;t++)if(!e.children[t]){const[s,i,n,o]=this._childBounds(e,t);e.children[t]=new D(s,i,n,o)}}_quadrant(e,t,s){const i=(e.minX+e.maxX)/2,n=(e.minY+e.maxY)/2;return(t>=i?1:0)+(s>=n?2:0)}_childBounds(e,t){const s=(e.minX+e.maxX)/2,i=(e.minY+e.maxY)/2;return[t&1?s:e.minX,t&2?i:e.minY,t&1?e.maxX:s,t&2?e.maxY:i]}_computeCOM(e){if(e.isLeaf)return;let t=0,s=0,i=0;for(const n of e.children)n&&(this._computeCOM(n),i+=n.totalMass,t+=n.cx*n.totalMass,s+=n.cy*n.totalMass);i>0&&(t/=i,s/=i),e.cx=t,e.cy=s,e.totalMass=i}_forceOn(e,t,s,i){if(s.isLeaf)return s.bodyIdx===i||s.totalMass===0?[0,0]:this._pairForce(e,t,s.cx,s.cy,s.totalMass);const n=s.cx-e[0],o=s.cy-e[1],a=n*n+o*o+this.epsilon2,r=s.size;if(r*r/a<this.theta*this.theta)return this._pairForce(e,t,s.cx,s.cy,s.totalMass);let h=0,c=0;for(const p of s.children){if(!p||p.totalMass===0)continue;const[v,d]=this._forceOn(e,t,p,i);h+=v,c+=d}return[h,c]}_pairForce(e,t,s,i,n){const o=s-e[0],a=i-e[1],r=o*o+a*a+this.epsilon2,h=1/Math.sqrt(r),c=h*h*h,p=this.G_val*t*n*c;return[p*o,p*a]}buildFlatTree(e){const t=e.length;if(t===0)return new Float32Array(0);let s=1/0,i=1/0,n=-1/0,o=-1/0;for(const f of e)f.position[0]<s&&(s=f.position[0]),f.position[1]<i&&(i=f.position[1]),f.position[0]>n&&(n=f.position[0]),f.position[1]>o&&(o=f.position[1]);const a=(n-s+o-i+1)*.1;s-=a,i-=a,n+=a,o+=a;const r=Math.max(n-s,o-i),h=(s+n)/2,c=(i+o)/2;s=h-r/2,n=h+r/2,i=c-r/2,o=c+r/2;const p=new D(s,i,n,o);for(let f=0;f<t;f++)this._insert(p,e[f],f);this._computeCOM(p);const v=[],d=[p];for(;d.length;){const f=d.shift();if(v.push(f),!f.isLeaf)for(const b of f.children)b&&d.push(b)}const m=new Map;v.forEach((f,b)=>m.set(f,b));const g=new Float32Array(v.length*8);for(let f=0;f<v.length;f++){const b=v[f],w=f*8;g[w+0]=b.cx,g[w+1]=b.cy,g[w+2]=b.totalMass,g[w+3]=b.size;for(let S=0;S<4;S++){const B=b.children[S],x=B?m.get(B)??re:re,M=new Uint32Array(g.buffer,(w+4+S)*4,1);M[0]=x>>>0}}return g}}const Re=`// N-body gravity compute shader (exact O(N²) mode)
// Uses tiled workgroup shared memory for cache efficiency.
// Semi-implicit Euler integration (symplectic – good energy conservation).

struct SimParams {
    numBodies : u32,
    dt        : f32,
    G         : f32,
    softening2: f32,
}

@group(0) @binding(0) var<uniform>            params  : SimParams;
@group(0) @binding(1) var<storage, read>      posIn   : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read>      velIn   : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read>      masses  : array<f32>;
@group(0) @binding(4) var<storage, read_write> posOut : array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> velOut : array<vec2<f32>>;

// Workgroup shared tile – size must match WORKGROUP_SIZE in constants.ts (256)
var<workgroup> tilePos  : array<vec2<f32>, 256>;
var<workgroup> tileMass : array<f32, 256>;

@compute @workgroup_size(256, 1, 1)
fn nbodyStep(
    @builtin(global_invocation_id) gid : vec3<u32>,
    @builtin(local_invocation_id)  lid : vec3<u32>,
) {
    let i   = gid.x;
    let tid = lid.x;
    let n   = params.numBodies;

    var acc  = vec2<f32>(0.0, 0.0);
    var posI = vec2<f32>(0.0, 0.0);
    var velI = vec2<f32>(0.0, 0.0);

    if (i < n) {
        posI = posIn[i];
        velI = velIn[i];
    }

    let numTiles = (n + 255u) / 256u;

    for (var tile = 0u; tile < numTiles; tile++) {
        let j = tile * 256u + tid;

        // Load tile into workgroup shared memory
        if (j < n) {
            tilePos[tid]  = posIn[j];
            tileMass[tid] = masses[j];
        } else {
            tilePos[tid]  = vec2<f32>(1e20, 1e20);
            tileMass[tid] = 0.0;
        }

        workgroupBarrier();

        // Accumulate forces from this tile
        if (i < n) {
            for (var k = 0u; k < 256u; k++) {
                let jGlobal = tile * 256u + k;
                if (jGlobal >= n || jGlobal == i) { continue; }

                let dp    = tilePos[k] - posI;
                let r2    = dot(dp, dp) + params.softening2;
                let invR  = inverseSqrt(r2);
                let invR3 = invR * invR * invR;
                acc += dp * (params.G * tileMass[k] * invR3);
            }
        }

        workgroupBarrier();
    }

    if (i >= n) { return; }

    // Semi-implicit (symplectic) Euler integration
    let newVel = velI + acc * params.dt;
    let newPos = posI + newVel * params.dt;

    velOut[i] = newVel;
    posOut[i] = newPos;
}
`,Oe=`// Integration-only compute shader used by Barnes-Hut mode.
// CPU supplies pre-computed force array; GPU applies semi-implicit Euler.

struct SimParams {
    numBodies : u32,
    dt        : f32,
    G         : f32,
    softening2: f32,
}

@group(0) @binding(0) var<uniform>            params    : SimParams;
@group(0) @binding(1) var<storage, read>      posIn     : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read>      velIn     : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read>      masses    : array<f32>;
@group(0) @binding(4) var<storage, read>      extForces : array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> posOut   : array<vec2<f32>>;
@group(0) @binding(6) var<storage, read_write> velOut   : array<vec2<f32>>;

@compute @workgroup_size(256, 1, 1)
fn integrateForces(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.numBodies) { return; }

    let mass  = masses[i];
    let force = extForces[i];
    let acc   = force / max(mass, 1e-30);

    let newVel = velIn[i] + acc * params.dt;
    let newPos = posIn[i] + newVel * params.dt;

    velOut[i] = newVel;
    posOut[i] = newPos;
}
`,ae=16;class De{device;adapter;initialized=!1;posBuffers=[];velBuffers=[];massBuffer;forceBuffer;uniformBuffer;readbackPosBuffer;readbackVelBuffer;pendingReadback=!1;cpuPositions;cpuVelocities;nbodyPipeline;integratePipeline;nbodyBindGroups=[];integrateBindGroups=[];pingPong=0;currentN=0;dt=.05;G=X;bh=new fe;bhFlatBuffer;bhNodeBuffer;bhNodeBufferSize=0;get isReady(){return this.initialized}async init(){if(!navigator.gpu)return!1;const e=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!e)return!1;this.adapter=e,this.device=await e.requestDevice({label:"OrbitCraft GPU"}),this.device.lost.then(a=>{console.error("WebGPU device lost:",a.message)});const t=a=>a*8,s=a=>a*4,i=t(L),n=s(L),o=t(L);return this.posBuffers=[k(this.device,i,"posA",!0),k(this.device,i,"posB",!0)],this.velBuffers=[k(this.device,i,"velA",!0),k(this.device,i,"velB",!0)],this.massBuffer=k(this.device,n,"masses"),this.forceBuffer=k(this.device,o,"forces"),this.uniformBuffer=Y(this.device,ae,"simParams"),this.readbackPosBuffer=oe(this.device,i,"readPos"),this.readbackVelBuffer=oe(this.device,i,"readVel"),this.cpuPositions=new Float32Array(L*2),this.cpuVelocities=new Float32Array(L*2),this.bhNodeBufferSize=256*32,this.bhNodeBuffer=k(this.device,this.bhNodeBufferSize,"bhNodes"),await this._buildPipelines(),this.initialized=!0,!0}async _buildPipelines(){const e=this.device,t=e.createShaderModule({code:Re,label:"nbody"});this.nbodyPipeline=e.createComputePipeline({layout:"auto",compute:{module:t,entryPoint:"nbodyStep"}});const s=e.createShaderModule({code:Oe,label:"integrate"});this.integratePipeline=e.createComputePipeline({layout:"auto",compute:{module:s,entryPoint:"integrateForces"}})}uploadBodies(e){const t=Math.min(e.length,L);this.currentN=t;const s=new Float32Array(t*2),i=new Float32Array(t*2),n=new Float32Array(t);for(let o=0;o<t;o++)s[o*2]=e[o].position[0],s[o*2+1]=e[o].position[1],i[o*2]=e[o].velocity[0],i[o*2+1]=e[o].velocity[1],n[o]=e[o].mass;I(this.device,this.posBuffers[0],s),I(this.device,this.velBuffers[0],i),I(this.device,this.massBuffer,n),this.pingPong=0,this._rebuildBindGroups()}_rebuildBindGroups(){for(let e=0;e<2;e++){const t=e,s=1-e;this.nbodyBindGroups[e]=this.device.createBindGroup({layout:this.nbodyPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:this.posBuffers[t]}},{binding:2,resource:{buffer:this.velBuffers[t]}},{binding:3,resource:{buffer:this.massBuffer}},{binding:4,resource:{buffer:this.posBuffers[s]}},{binding:5,resource:{buffer:this.velBuffers[s]}}],label:`nbodyBG_${e}`})}for(let e=0;e<2;e++){const t=e,s=1-e;this.integrateBindGroups[e]=this.device.createBindGroup({layout:this.integratePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:this.posBuffers[t]}},{binding:2,resource:{buffer:this.velBuffers[t]}},{binding:3,resource:{buffer:this.massBuffer}},{binding:4,resource:{buffer:this.forceBuffer}},{binding:5,resource:{buffer:this.posBuffers[s]}},{binding:6,resource:{buffer:this.velBuffers[s]}}],label:`integrateBG_${e}`})}}setDt(e){this.dt=e}_writeUniform(e){const t=new ArrayBuffer(ae),s=new DataView(t);s.setUint32(0,e,!0),s.setFloat32(4,this.dt,!0),s.setFloat32(8,this.G,!0),s.setFloat32(12,$,!0),I(this.device,this.uniformBuffer,new Uint8Array(t))}stepExact(){if(!this.initialized||this.currentN===0)return;this._writeUniform(this.currentN);const e=this.device.createCommandEncoder({label:"nbody-step"}),t=e.beginComputePass();t.setPipeline(this.nbodyPipeline),t.setBindGroup(0,this.nbodyBindGroups[this.pingPong]);const s=Math.ceil(this.currentN/se);t.dispatchWorkgroups(s),t.end(),this.device.queue.submit([e.finish()]),this.pingPong=1-this.pingPong}stepWithForces(e){if(!this.initialized||this.currentN===0)return;this._writeUniform(this.currentN),I(this.device,this.forceBuffer,e.subarray(0,this.currentN*2));const t=this.device.createCommandEncoder({label:"integrate-step"}),s=t.beginComputePass();s.setPipeline(this.integratePipeline),s.setBindGroup(0,this.integrateBindGroups[this.pingPong]);const i=Math.ceil(this.currentN/se);s.dispatchWorkgroups(i),s.end(),this.device.queue.submit([t.finish()]),this.pingPong=1-this.pingPong}addForcesAndStep(e,t){const s=this.currentN;let i;if(e){i=new Float32Array(s*2);for(let n=0;n<s*2;n++)i[n]=e[n]+t[n]}else i=t;this.stepWithForces(i)}scheduleReadback(){if(this.pendingReadback)return;this.pendingReadback=!0;const t=this.currentN*8,s=this.device.createCommandEncoder({label:"readback"}),i=this.posBuffers[this.pingPong],n=this.velBuffers[this.pingPong];s.copyBufferToBuffer(i,0,this.readbackPosBuffer,0,t),s.copyBufferToBuffer(n,0,this.readbackVelBuffer,0,t),this.device.queue.submit([s.finish()]),Promise.all([this.readbackPosBuffer.mapAsync(GPUMapMode.READ,0,t),this.readbackVelBuffer.mapAsync(GPUMapMode.READ,0,t)]).then(()=>{this.cpuPositions.set(new Float32Array(this.readbackPosBuffer.getMappedRange(0,t))),this.cpuVelocities.set(new Float32Array(this.readbackVelBuffer.getMappedRange(0,t))),this.readbackPosBuffer.unmap(),this.readbackVelBuffer.unmap(),this.pendingReadback=!1}).catch(()=>{this.pendingReadback=!1})}get currentPosBuffer(){return this.posBuffers[this.pingPong]}get currentVelBuffer(){return this.velBuffers[this.pingPong]}get bodyCount(){return this.currentN}async syncReadbackNow(){if(!this.initialized||this.currentN===0)return;const t=this.currentN*8;await this.device.queue.onSubmittedWorkDone();const s=this.device.createCommandEncoder();s.copyBufferToBuffer(this.posBuffers[this.pingPong],0,this.readbackPosBuffer,0,t),s.copyBufferToBuffer(this.velBuffers[this.pingPong],0,this.readbackVelBuffer,0,t),this.device.queue.submit([s.finish()]),await Promise.all([this.readbackPosBuffer.mapAsync(GPUMapMode.READ,0,t),this.readbackVelBuffer.mapAsync(GPUMapMode.READ,0,t)]),this.cpuPositions.set(new Float32Array(this.readbackPosBuffer.getMappedRange(0,t))),this.cpuVelocities.set(new Float32Array(this.readbackVelBuffer.getMappedRange(0,t))),this.readbackPosBuffer.unmap(),this.readbackVelBuffer.unmap()}patchBody(e,t,s){const i=new Float32Array([t[0],t[1]]),n=new Float32Array([s[0],s[1]]);this.device.queue.writeBuffer(this.posBuffers[this.pingPong],e*8,i),this.device.queue.writeBuffer(this.velBuffers[this.pingPong],e*8,n)}patchMass(e,t){const s=new Float32Array([t]);this.device.queue.writeBuffer(this.massBuffer,e*4,s)}}function j(l,e){return[l[0]+e[0],l[1]+e[1]]}function me(l,e){return[l[0]-e[0],l[1]-e[1]]}function J(l,e){return[l[0]*e,l[1]*e]}function Ge(l){return l[0]*l[0]+l[1]*l[1]}function K(l){return Math.sqrt(Ge(l))}function G(l){const e=K(l);return e<1e-20?[0,0]:[l[0]/e,l[1]/e]}function Ne(l,e,t){const s=K(l);if(s<1e-10)return[0,0];const i=Math.sqrt(t*e/s),n=[-l[1]/s,l[0]/s];return J(n,i)}function R(l,e,t,s,i=[0,0]){const n=me(l,e),o=Ne(n,t,s);return j(o,i)}function ce(l){const e=l.replace("#",""),t=parseInt(e.substring(0,2),16)/255,s=parseInt(e.substring(2,4),16)/255,i=parseInt(e.substring(4,6),16)/255;return[t,s,i]}function N(l,e,t){return Math.max(e,Math.min(t,l))}function z(l,e){return l+Math.random()*(e-l)}function Ye(){return Math.random()*Math.PI*2}function Xe(l,e=2){const t=Math.abs(l);return t>=1e9?(l/1e9).toFixed(e)+"G":t>=1e6?(l/1e6).toFixed(e)+"M":t>=1e3?(l/1e3).toFixed(e)+"k":t>=1?l.toFixed(e):t>=.001?(l*1e3).toFixed(e)+"m":l.toExponential(e)}function H(l,e,t){return l+(e-l)*t}let $e=0;function U(){return`body_${++$e}`}function le(l){switch(l){case"star":return _e;case"planet":return Me;case"moon":return Ie;case"asteroid":return Ee;case"rocket":return ke}}class qe{bodies=[];_dirty=!0;add(e){e.id||(e.id=U()),this.bodies.push(e),this._dirty=!0}remove(e){const t=this.bodies.findIndex(s=>s.id===e);return t===-1?!1:(this.bodies.splice(t,1),this._dirty=!0,!0)}get(e){return this.bodies.find(t=>t.id===e)}update(e,t){const s=this.get(e);s&&(Object.assign(s,t),this._dirty=!0)}get count(){return this.bodies.length}isDirty(){return this._dirty}clearDirty(){this._dirty=!1}markDirty(){this._dirty=!0}assignGPUIndices(){this.bodies.forEach((e,t)=>{e.gpuIndex=t})}applyReadback(e,t){for(let s=0;s<this.bodies.length;s++)this.bodies[s].position=[e[s*2],e[s*2+1]],this.bodies[s].velocity=[t[s*2],t[s*2+1]]}snapshot(){return this.bodies.map(e=>({...e,position:[...e.position],velocity:[...e.velocity]}))}clear(){this.bodies=[],this._dirty=!0}}const de="orbitcraft_universes";class Ve{universes=new Map;constructor(){this._load()}_load(){try{const e=localStorage.getItem(de);if(!e)return;const t=JSON.parse(e);for(const s of t)this.universes.set(s.id,s)}catch{}}_persist(){try{localStorage.setItem(de,JSON.stringify([...this.universes.values()]))}catch{console.warn("Failed to persist universes to localStorage")}}createUniverse(e){const t=`universe_${Date.now()}_${Math.random().toString(36).slice(2)}`,s={id:t,name:e,createdAt:Date.now(),modifiedAt:Date.now(),snapshots:[],activeSnapshotId:null};return this.universes.set(t,s),this._persist(),s}deleteUniverse(e){this.universes.delete(e),this._persist()}renameUniverse(e,t){const s=this.universes.get(e);s&&(s.name=t,s.modifiedAt=Date.now(),this._persist())}duplicateUniverse(e,t){const s=this.universes.get(e);if(!s)return null;const i=JSON.parse(JSON.stringify(s));return i.id=`universe_${Date.now()}_${Math.random().toString(36).slice(2)}`,i.name=t??s.name+" (copy)",i.createdAt=i.modifiedAt=Date.now(),this.universes.set(i.id,i),this._persist(),i}saveSnapshot(e,t,s,i,n,o){const a=this.universes.get(e);if(!a)throw new Error(`Universe ${e} not found`);const r=`snap_${Date.now()}`,h={id:r,name:o??new Date().toLocaleTimeString(),createdAt:Date.now(),simulationTime:n,bodies:JSON.parse(JSON.stringify(t)),params:{...s},camera:{...i}};return a.snapshots.push(h),a.snapshots.length>50&&a.snapshots.shift(),a.activeSnapshotId=r,a.modifiedAt=Date.now(),this._persist(),h}loadSnapshot(e,t){const s=this.universes.get(e);return s?s.snapshots.find(i=>i.id===t)??null:null}deleteSnapshot(e,t){const s=this.universes.get(e);s&&(s.snapshots=s.snapshots.filter(i=>i.id!==t),s.activeSnapshotId===t&&(s.activeSnapshotId=null),this._persist())}forkFromSnapshot(e,t,s){const i=this.loadSnapshot(e,t);if(!i)return null;const n=this.createUniverse(s);return this.saveSnapshot(n.id,i.bodies,i.params,i.camera,i.simulationTime,"initial"),n}exportUniverseJSON(e){const t=this.universes.get(e);if(!t)throw new Error(`Universe ${e} not found`);return JSON.stringify(t,null,2)}importUniverseJSON(e){const t=JSON.parse(e);return t.id=`universe_${Date.now()}_${Math.random().toString(36).slice(2)}`,t.modifiedAt=Date.now(),this.universes.set(t.id,t),this._persist(),t}listUniverses(){return[...this.universes.values()].sort((e,t)=>t.modifiedAt-e.modifiedAt)}getUniverse(e){return this.universes.get(e)}}let ve={star:0,planet:0,moon:0,asteroid:0,rocket:0};function F(l){const t={star:["Sol","Alpha","Proxima","Rigel","Vega"],planet:["Mercury","Venus","Earth","Mars","Jupiter","Saturn","Uranus","Neptune"],moon:["Luna","Phobos","Deimos","Titan","Ganymede","Europa","Io"],asteroid:["Ceres","Vesta","Pallas","Hygiea"],rocket:["Eagle","Falcon","Apollo","Artemis"]}[l]??[],s=ve[l]++;return t[s%t.length]+(s>=t.length?` ${Math.floor(s/t.length)+2}`:"")}class ze{bodySystem;gpu;saveSystem;activeUniverseId;params;simulationTime=0;_rebuildPending=!1;constructor(e){this.gpu=e,this.bodySystem=new qe,this.saveSystem=new Ve,this.params={G:X,dt:Se,epsilon:Math.sqrt($),mode:C};const t=this.saveSystem.listUniverses();if(t.length>0)this.activeUniverseId=t[0].id;else{const s=this.saveSystem.createUniverse("Default Universe");this.activeUniverseId=s.id}}generateInitialUniverse(){this.bodySystem.clear(),ve={star:0,planet:0,moon:0,asteroid:0,rocket:0};const e=this.params.G,t={id:U(),name:F("star"),type:"star",position:[0,0],velocity:[0,0],mass:Ae,radius:3.5,color:"#FDB813"};this.bodySystem.add(t);const s=[55,0],i=R(s,t.position,t.mass,e,t.velocity),n={id:U(),name:F("planet"),type:"planet",position:s,velocity:i,mass:ne,radius:.9,color:"#4B9CD3"};this.bodySystem.add(n);const o=[4.5,0],a=[n.position[0]+o[0],n.position[1]+o[1]],r=R(a,n.position,n.mass,e,n.velocity),h={id:U(),name:F("moon"),type:"moon",position:a,velocity:r,mass:Te,radius:.35,color:"#aaaaaa"};this.bodySystem.add(h);const c=Math.PI*.67,p=130,v=[p*Math.cos(c),p*Math.sin(c)],d=R(v,t.position,t.mass,e,t.velocity),m={id:U(),name:F("planet"),type:"planet",position:v,velocity:d,mass:ne*3,radius:1.8,color:"#C88B3A"};this.bodySystem.add(m);const g=700,f=75,b=115;for(let x=0;x<g;x++){const M=z(f,b),A=Ye(),u=[M*Math.cos(A),M*Math.sin(A)],y=R(u,t.position,t.mass,e,t.velocity);y[0]+=z(-.05,.05),y[1]+=z(-.05,.05),this.bodySystem.add({id:U(),name:`Ast${x}`,type:"asteroid",position:u,velocity:y,mass:Le,radius:.18,color:"#888888"})}const w=[n.position[0]+2,n.position[1]],S=R(w,n.position,n.mass,e,n.velocity),B={id:"rocket_0",name:F("rocket"),type:"rocket",position:w,velocity:S,mass:Ue,radius:.4,color:"#ff6b35",thrust:[0,1],fuel:Z,thrustMagnitude:.008,thrustActive:!1};this.bodySystem.add(B),this.bodySystem.assignGPUIndices(),this._rebuildPending=!0,this.simulationTime=0}addBody(e){const t={...e,id:U(),name:e.name??F(e.type),position:[...e.position],velocity:[...e.velocity],radius:e.radius??this._defaultRadius(e.type),color:e.color??this._defaultColor(e.type)};return this.bodySystem.add(t),this.scheduleRebuild(),t}removeBody(e){this.bodySystem.remove(e),this.scheduleRebuild()}updateBody(e,t){this.bodySystem.update(e,t);const s=this.bodySystem.get(e);if(!s||s.gpuIndex===void 0){this.scheduleRebuild();return}(t.position||t.velocity)&&this.gpu.patchBody(s.gpuIndex,s.position,s.velocity),t.mass!==void 0&&this.gpu.patchMass(s.gpuIndex,s.mass)}scheduleRebuild(){this._rebuildPending=!0}syncGPU(){return this._rebuildPending?(this.bodySystem.assignGPUIndices(),this.gpu.uploadBodies(this.bodySystem.bodies),this._rebuildPending=!1,!0):!1}loadSnapshot(e,t){const s=this.saveSystem.loadSnapshot(e,t);if(!s)return!1;this.bodySystem.clear();for(const i of s.bodies)this.bodySystem.add({...i});return this.params={...s.params},this.simulationTime=s.simulationTime,this.scheduleRebuild(),this.syncGPU(),!0}saveCurrentSnapshot(e,t){const s=t??{x:0,y:0,zoom:.006};return this.saveSystem.saveSnapshot(this.activeUniverseId,this.bodySystem.bodies,this.params,s,this.simulationTime,e).id}_defaultRadius(e){switch(e){case"star":return 3.5;case"planet":return 1;case"moon":return .35;case"asteroid":return .18;case"rocket":return .4}}_defaultColor(e){switch(e){case"star":return"#FDB813";case"planet":return"#4B9CD3";case"moon":return"#aaaaaa";case"asteroid":return"#777777";case"rocket":return"#ff6b35"}}}class He{applyThrust(e,t,s={thrustX:0,thrustY:0,boost:!1}){const i=new Float32Array(e.length*2);for(let n=0;n<e.length;n++){const o=e[n];if(o.type!=="rocket"||(o.fuel===void 0&&(o.fuel=Z),o.thrustMagnitude===void 0&&(o.thrustMagnitude=Ce),o.thrust===void 0&&(o.thrust=[0,0]),!o.thrustActive))continue;if(o.fuel<=0){o.thrustActive=!1;continue}let a=[o.thrust[0],o.thrust[1]];if(o.id==="rocket_0"||o.name?.startsWith("Rocket")){const c=s.thrustX,p=s.thrustY;Math.abs(c)+Math.abs(p)>.01&&(a=G([c,p]))}const r=o.thrustMagnitude*o.mass;i[n*2]+=a[0]*r,i[n*2+1]+=a[1]*r;const h=o.fuel>0?Fe:0;o.fuel=Math.max(0,o.fuel-h*t)}return i}setThrust(e,t){e.thrust=G(t),e.thrustActive=!0}stopThrust(e){e.thrustActive=!1}autopilotCircularise(e,t){const s=[e.position[0]-t.position[0],e.position[1]-t.position[1]],i=[-s[1],s[0]];e.thrust=G(i),e.thrustActive=!0}}function W(l,e,t){let s=e;for(let i=0;i<60;i++){const n=s,o=s-1,a=s-(1-l)/(n*n*Math.sign(n))-l/(o*o*Math.sign(o)),r=1+2*(1-l)/Math.pow(Math.abs(n),3)+2*l/Math.pow(Math.abs(o),3),h=a/r;if(s-=h,Math.abs(h)<1e-12)break}return s}class We{points=[];update(e){this.points=[];const t=e.filter(n=>n.type==="star"||n.type==="planet").sort((n,o)=>o.mass-n.mass);if(t.length<2)return this.points;const s=3;let i=0;for(let n=0;n<t.length&&i<s;n++)for(let o=n+1;o<t.length&&i<s;o++){const a=t[n],r=t[o],h=this._computePoints(a,r);this.points.push(...h),i++}return this.points}_computePoints(e,t){const s=e.mass,i=t.mass,n=s+i,o=i/n,a=me(t.position,e.position),r=K(a);if(r<1e-10)return[];const h=G(a),c=[-h[1],h[0]],p=W(o,1-o-.1),v=W(o,1-o+.1),d=W(o,-(1+o/3)),m=(f,b)=>j(e.position,j(J(h,f*r),J(c,b*r)));return[{label:"L1",position:m(p,0),stability:"unstable",primaryId:e.id,secondaryId:t.id},{label:"L2",position:m(v,0),stability:"unstable",primaryId:e.id,secondaryId:t.id},{label:"L3",position:m(d,0),stability:"unstable",primaryId:e.id,secondaryId:t.id},{label:"L4",position:m(1-o,+Math.sqrt(3)/2),stability:o<.0385?"stable":"semi-stable",primaryId:e.id,secondaryId:t.id},{label:"L5",position:m(1-o,-Math.sqrt(3)/2),stability:o<.0385?"stable":"semi-stable",primaryId:e.id,secondaryId:t.id}]}getPoints(){return this.points}}const je=3e3,Je=4;class Ze{paused=!1;speedMultiplier=1;mode=C;gpu;bh;rockets;lagrange;universe;renderer;gravity;camera;overlays={showTrails:!0,showLabels:!0,showLagrange:!0,showGravField:!1};rocketInput={thrustX:0,thrustY:0,boost:!1};frameCount=0;lastTime=0;fpsAlpha=.1;_fps=60;animId=0;lagrangePoints=[];lagrangeCounter=0;stats={fps:60,bodyCount:0,simTime:0,mode:C,stepsPerFrame:1};onStats;onBodiesChanged;constructor(e,t,s,i,n){this.gpu=e,this.universe=t,this.renderer=s,this.gravity=i,this.camera=n,this.bh=new fe,this.rockets=new He,this.lagrange=new We}setMode(e){this.mode=e,this.universe.params.mode=e}setSpeed(e){this.speedMultiplier=N(e,xe,Pe)}start(){this.lastTime=performance.now();const e=t=>{this.animId=requestAnimationFrame(e),this._frame(t)};this.animId=requestAnimationFrame(e)}stop(){this.animId&&cancelAnimationFrame(this.animId)}_frame(e){const t=Math.min((e-this.lastTime)/1e3,.1);this.lastTime=e,this._fps=this._fps*(1-this.fpsAlpha)+1/t*this.fpsAlpha,this.universe.syncGPU()&&(this.renderer.clearTrails(),this.onBodiesChanged?.());const i=this.universe.bodySystem.bodies,n=i.length,o=this.universe.params.dt*this.speedMultiplier,r=Math.min(20,Math.max(1,Math.round(this.speedMultiplier)));if(!this.paused&&n>0){const h=this._resolveMode(n);for(let v=0;v<r;v++){const d=this.rockets.applyThrust(i,o,this.rocketInput);if(h===C)d.some(g=>g!==0)?this.gpu.stepExact():this.gpu.stepExact();else{const m=this.bh.computeForces(i);for(let g=0;g<n*2;g++)m[g]+=d[g]??0;this.gpu.stepWithForces(m)}this.universe.simulationTime+=o}this.frameCount%Je===0&&this.gpu.scheduleReadback();const c=this.gpu.cpuPositions,p=this.gpu.cpuVelocities;if(this.universe.bodySystem.applyReadback(c,p),this.lagrangeCounter++,this.lagrangeCounter%30===0){const v=i.filter(d=>d.type==="star"||d.type==="planet");this.lagrangePoints=this.lagrange.update(v),this.lagrangeCounter=0}}if(this.camera.update(t),this.renderer.updatePositionsFromCPU(i,this.gpu.cpuPositions,this.gpu.cpuVelocities),this.renderer.render(this.camera,i,this.gpu.cpuPositions,this.overlays.showTrails,this.overlays.showLabels,this.lagrangePoints,this.overlays.showLagrange),this.overlays.showGravField&&i.length<512){const c=this.renderer.context.getCurrentTexture().createView(),p=this.gpu.device.createCommandEncoder({label:"grav-field"});this.gravity.render(p,c,this.camera,i),this.gpu.device.queue.submit([p.finish()])}this.stats={fps:Math.round(this._fps),bodyCount:n,simTime:this.universe.simulationTime,mode:this.mode,stepsPerFrame:r},this.onStats?.(this.stats),this.frameCount++}_resolveMode(e){return this.mode===pe?e<je?C:he:this.mode}stepOnce(){if(!this.paused)return;const e=this.universe.bodySystem.bodies,t=e.length;if(t===0)return;const s=this.universe.params.dt;if(this.gpu.setDt(s),this._resolveMode(t)===C)this.gpu.stepExact();else{const i=this.bh.computeForces(e);this.gpu.stepWithForces(i)}this.universe.simulationTime+=s,this.gpu.scheduleReadback()}}const Ke=`// Instanced body rendering shader.
// Each body maps to one quad (6 vertices, 2 triangles).
// Body data is read from a storage buffer via instance_index.

struct CameraUniform {
    centerX     : f32,   // world X of screen centre
    centerY     : f32,   // world Y of screen centre
    zoom        : f32,   // world-units visible in half-screen height
    aspectRatio : f32,   // width / height
}

// Tight packing: 48 bytes per body
struct BodyRenderData {
    posX    : f32,      //  0
    posY    : f32,      //  4
    velX    : f32,      //  8
    velY    : f32,      // 12
    colorR  : f32,      // 16
    colorG  : f32,      // 20
    colorB  : f32,      // 24
    colorA  : f32,      // 28
    radius  : f32,      // 32
    bodyType: u32,      // 36
    pad0    : f32,      // 40
    pad1    : f32,      // 44
}

@group(0) @binding(0) var<uniform>       camera : CameraUniform;
@group(0) @binding(1) var<storage, read> bodies : array<BodyRenderData>;

struct VSOut {
    @builtin(position) pos      : vec4<f32>,
    @location(0)       uv       : vec2<f32>,
    @location(1)       color    : vec4<f32>,
    @location(2)       bodyType : f32,
}

// Six corners for two-triangle quad
fn quadCorner(vIdx: u32) -> vec2<f32> {
    switch vIdx {
        case 0u: { return vec2<f32>(-1.0, -1.0); }
        case 1u: { return vec2<f32>( 1.0, -1.0); }
        case 2u: { return vec2<f32>(-1.0,  1.0); }
        case 3u: { return vec2<f32>(-1.0,  1.0); }
        case 4u: { return vec2<f32>( 1.0, -1.0); }
        default: { return vec2<f32>( 1.0,  1.0); }
    }
}

@vertex
fn vs_main(
    @builtin(vertex_index)   vIdx : u32,
    @builtin(instance_index) iIdx : u32,
) -> VSOut {
    let body   = bodies[iIdx];
    let corner = quadCorner(vIdx);

    let worldX = body.posX + corner.x * body.radius;
    let worldY = body.posY + corner.y * body.radius;

    // Camera transform → NDC
    let relX = (worldX - camera.centerX) * camera.zoom;
    let relY = (worldY - camera.centerY) * camera.zoom;
    let ndcX = relX / camera.aspectRatio;
    let ndcY = relY;

    var out : VSOut;
    out.pos      = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
    out.uv       = corner;
    out.color    = vec4<f32>(body.colorR, body.colorG, body.colorB, body.colorA);
    out.bodyType = f32(body.bodyType);
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    let d = length(in.uv);
    if (d > 1.0) { discard; }

    var alpha = 1.0 - smoothstep(0.65, 1.0, d);

    // Stars: wide atmospheric glow
    if (in.bodyType < 0.5) {
        let glow = exp(-d * 2.5) * 0.6;
        alpha = max(alpha, glow);
        // bright core
        if (d < 0.3) { alpha = 1.0; }
    }
    // Rockets: elongated exhaust hint in fragment
    if (in.bodyType > 3.5) {
        alpha *= 1.2;
    }

    return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
`,Qe=16;class et{device;context;format;bodyRenderBuffer;cameraUniformBuffer;renderPipeline;renderBindGroup;maxBodies;currentN=0;overlayCanvas;overlayCtx;trailPositions=new Map;trailIndex=new Map;TRAIL_LEN=300;trailUpdateCounter=0;constructor(e){this.maxBodies=e}async init(e,t,s){this.device=s,this.overlayCanvas=t,this.overlayCtx=t.getContext("2d"),this.context=e.getContext("webgpu"),this.format=navigator.gpu.getPreferredCanvasFormat(),this.context.configure({device:s,format:this.format,alphaMode:"premultiplied"}),this.cameraUniformBuffer=Y(s,Qe,"camera"),this.bodyRenderBuffer=k(s,this.maxBodies*V,"bodyRender"),await this._buildPipeline()}async _buildPipeline(){const e=this.device,t=e.createShaderModule({code:Ke,label:"renderBodies"});this.renderPipeline=e.createRenderPipeline({layout:"auto",vertex:{module:t,entryPoint:"vs_main"},fragment:{module:t,entryPoint:"fs_main",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}}),this._rebuildBindGroup()}_rebuildBindGroup(){this.renderBindGroup=this.device.createBindGroup({layout:this.renderPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.cameraUniformBuffer}},{binding:1,resource:{buffer:this.bodyRenderBuffer}}]})}uploadBodyRenderData(e){const t=Math.min(e.length,this.maxBodies);this.currentN=t;const s=new ArrayBuffer(t*V),i=new Float32Array(s),n=new Uint32Array(s);for(let o=0;o<t;o++){const a=e[o],r=o*12,[h,c,p]=ce(a.color);i[r+0]=a.position[0],i[r+1]=a.position[1],i[r+2]=a.velocity[0],i[r+3]=a.velocity[1],i[r+4]=h,i[r+5]=c,i[r+6]=p,i[r+7]=1,i[r+8]=a.radius,n[r+9]=le(a.type),i[r+10]=0,i[r+11]=0}I(this.device,this.bodyRenderBuffer,new Uint8Array(s))}updatePositionsFromCPU(e,t,s){const i=Math.min(e.length,this.maxBodies);if(i===0)return;const n=new ArrayBuffer(i*V),o=new Float32Array(n),a=new Uint32Array(n);for(let r=0;r<i;r++){const h=e[r],c=r*12,[p,v,d]=ce(h.color);o[c+0]=t[r*2],o[c+1]=t[r*2+1],o[c+2]=s[r*2],o[c+3]=s[r*2+1],o[c+4]=p,o[c+5]=v,o[c+6]=d,o[c+7]=1,o[c+8]=h.radius,a[c+9]=le(h.type),o[c+10]=0,o[c+11]=0}I(this.device,this.bodyRenderBuffer,new Uint8Array(n))}render(e,t,s,i,n,o,a){if(this.currentN===0)return;I(this.device,this.cameraUniformBuffer,e.getUniformData());const r=this.context.getCurrentTexture(),h=this.device.createCommandEncoder({label:"render"}),c=h.beginRenderPass({colorAttachments:[{view:r.createView(),clearValue:{r:.04,g:.04,b:.07,a:1},loadOp:"clear",storeOp:"store"}]});c.setPipeline(this.renderPipeline),c.setBindGroup(0,this.renderBindGroup),c.draw(6,this.currentN),c.end(),this.device.queue.submit([h.finish()]),this._renderOverlay(e,t,s,i,n,o,a)}_renderOverlay(e,t,s,i,n,o,a){const r=this.overlayCtx,h=this.overlayCanvas.width,c=this.overlayCanvas.height;r.clearRect(0,0,h,c);const p=Math.min(t.length,this.currentN);this.trailUpdateCounter++;const v=this.trailUpdateCounter%3===0;if(i&&v)for(let d=0;d<p;d++){const m=t[d],g=s[d*2],f=s[d*2+1];this.trailPositions.has(m.id)||(this.trailPositions.set(m.id,new Float32Array(this.TRAIL_LEN*2)),this.trailIndex.set(m.id,0));const b=this.trailPositions.get(m.id),w=this.trailIndex.get(m.id);b[w*2]=g,b[w*2+1]=f,this.trailIndex.set(m.id,(w+1)%this.TRAIL_LEN)}if(i){r.lineWidth=1;for(let d=0;d<p;d++){const m=t[d];if(!this.trailPositions.has(m.id))continue;const g=this.trailPositions.get(m.id),f=this.trailIndex.get(m.id);r.beginPath();let b=!1;for(let w=0;w<this.TRAIL_LEN;w++){const S=(f+w)%this.TRAIL_LEN,B=g[S*2],x=g[S*2+1];if(B===0&&x===0)continue;const[M,A]=e.worldToScreen(B,x);w/this.TRAIL_LEN*.7,b?r.lineTo(M,A):(r.moveTo(M,A),b=!0)}r.strokeStyle=m.color+"99",r.stroke()}}if(n){r.font="11px monospace",r.textAlign="left";for(let d=0;d<p;d++){const m=t[d];if(m.type==="asteroid")continue;const g=s[d*2],f=s[d*2+1],[b,w]=e.worldToScreen(g,f),S=e.worldToScreenSize(m.radius);r.fillStyle="#c9d1d9",r.fillText(m.name,b+S+4,w-4)}}if(a)for(const d of o){const[m,g]=e.worldToScreen(d.position[0],d.position[1]),f=d.stability==="stable"?"#44ff88":d.stability==="semi-stable"?"#ffcc44":"#ff4444";r.beginPath(),r.arc(m,g,5,0,Math.PI*2),r.fillStyle=f+"99",r.fill(),r.strokeStyle=f,r.lineWidth=1.5,r.stroke(),r.font="10px monospace",r.fillStyle=f,r.fillText(d.label,m+8,g+4)}}resize(e,t){this.overlayCanvas.width=e,this.overlayCanvas.height=t}clearTrails(){this.trailPositions.clear(),this.trailIndex.clear()}}const tt=`// Gravity field visualisation – fullscreen fragment pass.
// Samples gravitational potential at each pixel and renders a heatmap overlay.

struct CameraUniform {
    centerX     : f32,
    centerY     : f32,
    zoom        : f32,
    aspectRatio : f32,
}

struct FieldParams {
    numBodies   : u32,
    G           : f32,
    softening2  : f32,
    intensity   : f32,   // scale factor for colour mapping
}

struct BodyFieldData {
    posX : f32,
    posY : f32,
    mass : f32,
    pad  : f32,
}

@group(0) @binding(0) var<uniform>       camera : CameraUniform;
@group(0) @binding(1) var<uniform>       fp     : FieldParams;
@group(0) @binding(2) var<storage, read> bodies : array<BodyFieldData>;

struct VSOut {
    @builtin(position) pos : vec4<f32>,
    @location(0)       uv  : vec2<f32>,
}

// Fullscreen triangle trick (no vertex buffer needed)
@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32) -> VSOut {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>( 3.0,  1.0),
        vec2<f32>(-1.0,  1.0),
    );
    var out : VSOut;
    out.pos = vec4<f32>(pos[vIdx], 0.0, 1.0);
    out.uv  = pos[vIdx];
    return out;
}

// Map NDC to world space
fn ndcToWorld(ndc: vec2<f32>) -> vec2<f32> {
    let wx = ndc.x * camera.aspectRatio / camera.zoom + camera.centerX;
    let wy = ndc.y / camera.zoom + camera.centerY;
    return vec2<f32>(wx, wy);
}

// Colour map: dark blue → cyan → yellow → red
fn heatmapColor(t: f32) -> vec3<f32> {
    let t1 = clamp(t, 0.0, 1.0);
    var col = vec3<f32>(0.0, 0.0, 0.0);
    if (t1 < 0.25) {
        col = mix(vec3<f32>(0.0, 0.0, 0.3), vec3<f32>(0.0, 0.5, 1.0), t1 / 0.25);
    } else if (t1 < 0.5) {
        col = mix(vec3<f32>(0.0, 0.5, 1.0), vec3<f32>(0.0, 1.0, 0.5), (t1 - 0.25) / 0.25);
    } else if (t1 < 0.75) {
        col = mix(vec3<f32>(0.0, 1.0, 0.5), vec3<f32>(1.0, 1.0, 0.0), (t1 - 0.5) / 0.25);
    } else {
        col = mix(vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), (t1 - 0.75) / 0.25);
    }
    return col;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    let worldPos = ndcToWorld(in.uv);

    // Compute gravitational potential φ = -G * Σ m_i / r_i
    var potential = 0.0;
    for (var i = 0u; i < fp.numBodies; i++) {
        let dx = worldPos.x - bodies[i].posX;
        let dy = worldPos.y - bodies[i].posY;
        let r2 = dx * dx + dy * dy + fp.softening2;
        potential += fp.G * bodies[i].mass / sqrt(r2);
    }

    // Log scale for wide dynamic range
    let logPot = log(max(potential * fp.intensity, 1e-6)) / log(1e6);
    let t      = clamp(logPot, 0.0, 1.0);

    let col   = heatmapColor(t);
    let alpha = clamp(t * 0.55, 0.0, 0.55);

    return vec4<f32>(col, alpha);
}
`,st=16,ue=256;class it{device;pipeline;cameraBuffer;fieldParamsBuffer;bodiesBuffer;bindGroup;format;async init(e,t){this.device=e,this.format=t,this.cameraBuffer=Y(e,16,"fieldCamera"),this.fieldParamsBuffer=Y(e,16,"fieldParams"),this.bodiesBuffer=k(e,ue*st,"fieldBodies"),await this._buildPipeline()}async _buildPipeline(){const e=this.device.createShaderModule({code:tt,label:"raymarch"});this.pipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:e,entryPoint:"vs_main"},fragment:{module:e,entryPoint:"fs_main",targets:[{format:this.format,blend:{color:{srcFactor:"src-alpha",dstFactor:"one",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one",operation:"add"}}}]},primitive:{topology:"triangle-list"}})}_rebuildBindGroup(){this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.cameraBuffer}},{binding:1,resource:{buffer:this.fieldParamsBuffer}},{binding:2,resource:{buffer:this.bodiesBuffer}}]})}render(e,t,s,i,n=1){const o=[...i].filter(v=>v.type!=="asteroid").sort((v,d)=>d.mass-v.mass).slice(0,ue),a=o.length;if(a===0)return;I(this.device,this.cameraBuffer,s.getUniformData());const r=new ArrayBuffer(16),h=new DataView(r);h.setUint32(0,a,!0),h.setFloat32(4,X,!0),h.setFloat32(8,$,!0),h.setFloat32(12,n,!0),I(this.device,this.fieldParamsBuffer,new Uint8Array(r));const c=new Float32Array(a*4);for(let v=0;v<a;v++)c[v*4+0]=o[v].position[0],c[v*4+1]=o[v].position[1],c[v*4+2]=o[v].mass,c[v*4+3]=0;I(this.device,this.bodiesBuffer,c),this._rebuildBindGroup();const p=e.beginRenderPass({colorAttachments:[{view:t,loadOp:"load",storeOp:"store"}]});p.setPipeline(this.pipeline),p.setBindGroup(0,this.bindGroup),p.draw(3),p.end()}}class nt{cam;canvas;dragging=!1;lastMouse=[0,0];followId=null;followPos=[0,0];constructor(e){this.canvas=e,this.cam={x:0,y:0,zoom:1/ie,targetX:0,targetY:0,targetZoom:1/ie},this.bindEvents()}bindEvents(){const e=this.canvas;e.addEventListener("mousedown",s=>{this.dragging=!0,this.lastMouse=[s.clientX,s.clientY],this.followId=null}),e.addEventListener("mousemove",s=>{if(!this.dragging)return;const i=s.clientX-this.lastMouse[0],n=s.clientY-this.lastMouse[1];this.lastMouse=[s.clientX,s.clientY];const o=-i/(e.height/2)/this.cam.zoom,a=n/(e.height/2)/this.cam.zoom;this.cam.targetX+=o,this.cam.targetY+=a,this.cam.x=this.cam.targetX,this.cam.y=this.cam.targetY}),e.addEventListener("mouseup",()=>{this.dragging=!1}),e.addEventListener("mouseleave",()=>{this.dragging=!1}),e.addEventListener("wheel",s=>{s.preventDefault();const i=s.deltaY>0?.85:1/.85;this.cam.targetZoom=N(this.cam.targetZoom*i,1e-6,1e3),this.cam.zoom=this.cam.targetZoom},{passive:!1});let t=0;e.addEventListener("touchstart",s=>{if(s.touches.length===1&&(this.dragging=!0,this.lastMouse=[s.touches[0].clientX,s.touches[0].clientY]),s.touches.length===2){const i=s.touches[0].clientX-s.touches[1].clientX,n=s.touches[0].clientY-s.touches[1].clientY;t=Math.hypot(i,n)}},{passive:!0}),e.addEventListener("touchmove",s=>{if(s.touches.length===1&&this.dragging){const i=s.touches[0].clientX-this.lastMouse[0],n=s.touches[0].clientY-this.lastMouse[1];this.lastMouse=[s.touches[0].clientX,s.touches[0].clientY];const o=-i/(e.height/2)/this.cam.zoom,a=n/(e.height/2)/this.cam.zoom;this.cam.targetX+=o,this.cam.targetY+=a,this.cam.x=this.cam.targetX,this.cam.y=this.cam.targetY}if(s.touches.length===2){const i=s.touches[0].clientX-s.touches[1].clientX,n=s.touches[0].clientY-s.touches[1].clientY,o=Math.hypot(i,n),a=o/t;t=o,this.cam.targetZoom=N(this.cam.targetZoom*a,1e-6,1e3),this.cam.zoom=this.cam.targetZoom}},{passive:!0}),e.addEventListener("touchend",()=>{this.dragging=!1})}followBody(e,t){this.followId=e,e!==null&&(this.followPos=t,this.cam.targetX=t[0],this.cam.targetY=t[1])}update(e,t){this.followId!==null&&t&&(this.cam.targetX=t[0],this.cam.targetY=t[1]);const s=N(1-Math.exp(-e*10),0,1);this.cam.x=H(this.cam.x,this.cam.targetX,s),this.cam.y=H(this.cam.y,this.cam.targetY,s),this.cam.zoom=H(this.cam.zoom,this.cam.targetZoom,s)}focusOn(e,t,s){this.cam.targetX=e,this.cam.targetY=t,this.cam.x=e,this.cam.y=t,this.followId=null,s!==void 0&&(this.cam.targetZoom=s,this.cam.zoom=s)}screenToWorld(e,t){const s=this.canvas.width/2,i=this.canvas.height/2,n=(e-s)/(i*this.cam.zoom)+this.cam.x,o=-(t-i)/(i*this.cam.zoom)+this.cam.y;return[n,o]}worldToScreen(e,t){const s=this.canvas.width/2,i=this.canvas.height/2,n=(e-this.cam.x)*i*this.cam.zoom+s,o=-(t-this.cam.y)*i*this.cam.zoom+i;return[n,o]}worldToScreenSize(e){return e*(this.canvas.height/2)*this.cam.zoom}get(){return this.cam}getUniformData(){const e=this.canvas.width/this.canvas.height;return new Float32Array([this.cam.x,this.cam.y,this.cam.zoom,e])}}class ot{container;listEl;searchEl;selectedId=null;filter="";onSelect;onDelete;onFocus;constructor(e){this.container=e,this.container.innerHTML=`
      <div class="panel-header">
        <span class="panel-title">Bodies</span>
        <button id="btn-add-body" class="icon-btn" title="Add body">+</button>
      </div>
      <input id="body-search" class="search-input" type="text" placeholder="Search…" />
      <div id="body-list-items" class="body-list-scroll"></div>
    `,this.listEl=this.container.querySelector("#body-list-items"),this.searchEl=this.container.querySelector("#body-search"),this.searchEl.addEventListener("input",()=>{this.filter=this.searchEl.value.toLowerCase()})}setSelectedId(e){this.selectedId=e}render(e){const t=e.bodies,s=this.filter?t.filter(a=>a.name.toLowerCase().includes(this.filter)||a.type.includes(this.filter)):t,i=["star","planet","moon","rocket","asteroid"],n=[...s].sort((a,r)=>{const h=i.indexOf(a.type),c=i.indexOf(r.type);return(h===-1?99:h)-(c===-1?99:c)});this.listEl.innerHTML="";for(const a of n){const r=document.createElement("div");r.className="body-item"+(a.id===this.selectedId?" selected":""),r.dataset.id=a.id;const h=document.createElement("span");h.className="body-dot",h.style.background=a.color;const c=document.createElement("span");c.className="body-name",c.textContent=a.name;const p=document.createElement("span");p.className="body-type",p.textContent=a.type;const v=document.createElement("button");v.className="del-btn",v.textContent="×",v.title="Delete",v.addEventListener("click",d=>{d.stopPropagation(),this.onDelete?.(a.id)}),r.appendChild(h),r.appendChild(c),r.appendChild(p),r.appendChild(v),r.addEventListener("click",()=>{this.selectedId=a.id,this.onSelect?.(a.id)}),r.addEventListener("dblclick",()=>{this.onFocus?.(a)}),this.listEl.appendChild(r)}const o=this.container.querySelector(".panel-title");o&&(o.textContent=`Bodies (${t.length})`)}}class rt{container;selectedId=null;onUpdate;onThrustToggle;onAutopilot;constructor(e){this.container=e,this._renderEmpty()}_renderEmpty(){this.container.innerHTML=`
      <div class="panel-header"><span class="panel-title">Inspector</span></div>
      <div class="inspector-empty">Select a body to inspect</div>
    `}render(e){if(!e){this._renderEmpty();return}this.selectedId=e.id;const t=Math.hypot(e.velocity[0],e.velocity[1]),s=e.fuel!==void 0?`<div class="field-row">
           <label>Fuel</label>
           <div class="fuel-bar-wrap">
             <div class="fuel-bar" style="width:${Math.min(100,e.fuel/1e3*100).toFixed(1)}%"></div>
           </div>
           <span class="field-val">${e.fuel.toFixed(0)}</span>
         </div>`:"",i=e.type==="rocket"?`
      <div class="rocket-controls">
        <div class="field-row">
          <label>Thrust (N/E/S/W keys)</label>
        </div>
        <div class="field-row">
          <label>Thrust mag</label>
          <input class="num-input" id="inp-thrust-mag" type="number" step="0.001" min="0.001" max="0.1" value="${(e.thrustMagnitude??.008).toFixed(4)}" />
        </div>
        <div class="btn-row">
          <button id="btn-thrust-toggle" class="action-btn ${e.thrustActive?"active":""}">
            ${e.thrustActive?"Engine ON":"Engine OFF"}
          </button>
          <button id="btn-autopilot" class="action-btn">Circularise</button>
        </div>
        ${s}
      </div>`:"";this.container.innerHTML=`
      <div class="panel-header">
        <span class="panel-title">Inspector</span>
        <div class="body-color-swatch" style="background:${e.color}"></div>
      </div>
      <div class="inspector-content">
        <div class="field-row">
          <label>Name</label>
          <input class="text-input" id="inp-name" type="text" value="${e.name}" />
        </div>
        <div class="field-row">
          <label>Type</label>
          <select id="inp-type" class="select-input">
            ${["star","planet","moon","asteroid","rocket"].map(n=>`<option value="${n}" ${n===e.type?"selected":""}>${n}</option>`).join("")}
          </select>
        </div>
        <div class="field-row">
          <label>Color</label>
          <input id="inp-color" type="color" value="${e.color}" class="color-input" />
        </div>
        <div class="section-header">Physics</div>
        <div class="field-row">
          <label>Mass</label>
          <input class="num-input" id="inp-mass" type="number" step="any" value="${e.mass}" />
        </div>
        <div class="field-row">
          <label>Radius</label>
          <input class="num-input" id="inp-radius" type="number" step="0.01" min="0.01" value="${e.radius}" />
        </div>
        <div class="section-header">Position</div>
        <div class="field-row">
          <label>X</label>
          <input class="num-input" id="inp-px" type="number" step="any" value="${e.position[0].toFixed(4)}" />
          <label>Y</label>
          <input class="num-input" id="inp-py" type="number" step="any" value="${e.position[1].toFixed(4)}" />
        </div>
        <div class="section-header">Velocity</div>
        <div class="field-row">
          <label>VX</label>
          <input class="num-input" id="inp-vx" type="number" step="any" value="${e.velocity[0].toFixed(4)}" />
          <label>VY</label>
          <input class="num-input" id="inp-vy" type="number" step="any" value="${e.velocity[1].toFixed(4)}" />
        </div>
        <div class="field-row">
          <label>Speed</label>
          <span class="field-val">${Xe(t,3)}</span>
        </div>
        ${i}
      </div>
    `,this._bindEvents(e)}_bindEvents(e){const t=a=>this.container.querySelector("#"+a),s=()=>{if(!this.selectedId)return;const a={name:t("inp-name").value,type:t("inp-type").value,color:t("inp-color").value,mass:parseFloat(t("inp-mass").value),radius:parseFloat(t("inp-radius").value),position:[parseFloat(t("inp-px").value),parseFloat(t("inp-py").value)],velocity:[parseFloat(t("inp-vx").value),parseFloat(t("inp-vy").value)]};this.onUpdate?.(this.selectedId,a)};["inp-name","inp-type","inp-color","inp-mass","inp-radius","inp-px","inp-py","inp-vx","inp-vy"].forEach(a=>{const r=this.container.querySelector("#"+a);r&&r.addEventListener("change",s)});const i=this.container.querySelector("#btn-thrust-toggle");i&&i.addEventListener("click",()=>{const a=!e.thrustActive;this.onThrustToggle?.(e.id,a)});const n=this.container.querySelector("#btn-autopilot");n&&n.addEventListener("click",()=>{this.onAutopilot?.(e.id)});const o=this.container.querySelector("#inp-thrust-mag");o&&o.addEventListener("change",()=>{this.onUpdate?.(e.id,{thrustMagnitude:parseFloat(o.value)})})}}class at{container;onPause;onSpeed;onStepOnce;pauseBtn;speedSlider;speedLabel;statsLabel;paused=!1;speed=1;constructor(e){this.container=e,this.container.innerHTML=`
      <div class="control-bar-inner">
        <button id="btn-pause" class="ctrl-btn" title="Play/Pause">⏸</button>
        <button id="btn-step"  class="ctrl-btn" title="Step frame">⏭</button>
        <div class="speed-wrap">
          <label class="ctrl-label">Speed</label>
          <input id="speed-slider" type="range" min="-4" max="4" step="0.01" value="0" class="speed-slider" />
          <span id="speed-label" class="ctrl-val">×1.0</span>
        </div>
        <div class="stats-wrap">
          <span id="stats-label" class="stats-text">0 bodies · 0 fps</span>
        </div>
      </div>
    `,this.pauseBtn=this.container.querySelector("#btn-pause"),this.speedSlider=this.container.querySelector("#speed-slider"),this.speedLabel=this.container.querySelector("#speed-label"),this.statsLabel=this.container.querySelector("#stats-label"),this.pauseBtn.addEventListener("click",()=>{this.paused=!this.paused,this.pauseBtn.textContent=this.paused?"▶":"⏸",this.onPause?.(this.paused)}),this.container.querySelector("#btn-step").addEventListener("click",()=>{this.onStepOnce?.()}),this.speedSlider.addEventListener("input",()=>{const t=parseFloat(this.speedSlider.value);this.speed=Math.pow(10,t),this.speedLabel.textContent=`×${this.speed<1?this.speed.toExponential(1):this.speed.toFixed(this.speed>=100?0:1)}`,this.onSpeed?.(this.speed)})}updateStats(e){const t=e.simTime,s=t>=1e3?`${(t/1e3).toFixed(1)}k`:t.toFixed(1);this.statsLabel.textContent=`${e.bodyCount} bodies · ${e.fps} fps · T=${s} · ${e.mode} · ×${e.stepsPerFrame}`}setPaused(e){this.paused=e,this.pauseBtn.textContent=e?"▶":"⏸"}}class ct{container;onModeChange;onOverlayChange;flags={showTrails:!0,showLabels:!0,showLagrange:!0,showGravField:!1};constructor(e){this.container=e,this.container.innerHTML=`
      <div class="topbar-inner">
        <div class="mode-group">
          <label class="topbar-label">Mode</label>
          <select id="mode-select" class="mode-select">
            <option value="${C}">Exact (GPU)</option>
            <option value="${he}">Barnes-Hut</option>
            <option value="${pe}">Hybrid</option>
          </select>
        </div>
        <div class="overlay-group">
          <label class="topbar-label">Overlays</label>
          <label class="toggle-label"><input type="checkbox" id="chk-trails"   ${this.flags.showTrails?"checked":""} /> Trails</label>
          <label class="toggle-label"><input type="checkbox" id="chk-labels"   ${this.flags.showLabels?"checked":""} /> Labels</label>
          <label class="toggle-label"><input type="checkbox" id="chk-lagrange" ${this.flags.showLagrange?"checked":""} /> L-Points</label>
          <label class="toggle-label"><input type="checkbox" id="chk-grav"     ${this.flags.showGravField?"checked":""} /> Grav Field</label>
        </div>
        <div class="add-body-group">
          <select id="add-type-select" class="mode-select">
            <option value="star">Star</option>
            <option value="planet" selected>Planet</option>
            <option value="moon">Moon</option>
            <option value="asteroid">Asteroid</option>
            <option value="rocket">Rocket</option>
          </select>
          <button id="btn-add-click" class="action-btn">+ Add (click canvas)</button>
        </div>
      </div>
    `,this.container.querySelector("#mode-select").addEventListener("change",s=>{this.onModeChange?.(s.target.value)});const t=[["chk-trails","showTrails"],["chk-labels","showLabels"],["chk-lagrange","showLagrange"],["chk-grav","showGravField"]];for(const[s,i]of t)this.container.querySelector("#"+s).addEventListener("change",n=>{this.flags[i]=n.target.checked,this.onOverlayChange?.(this.flags)})}getAddType(){return this.container.querySelector("#add-type-select")?.value??"planet"}setAddClickListener(e){this.container.querySelector("#btn-add-click").addEventListener("click",e)}setMode(e){const t=this.container.querySelector("#mode-select");t&&(t.value=e)}}class lt{container;saveSystem;universe;camera;onLoadSnapshot;onNewUniverse;onSwitchUniverse;constructor(e,t,s,i){this.container=e,this.saveSystem=t,this.universe=s,this.camera=i,this._build()}_build(){this.container.innerHTML=`
      <div class="panel-header">
        <span class="panel-title">Universes</span>
      </div>
      <div class="univ-actions">
        <button id="btn-new-univ"  class="action-btn">New</button>
        <button id="btn-dup-univ"  class="action-btn">Fork</button>
        <button id="btn-save-snap" class="action-btn">Snapshot</button>
        <button id="btn-export"    class="action-btn">Export</button>
        <button id="btn-import"    class="action-btn">Import</button>
      </div>
      <div id="univ-list" class="univ-list"></div>
    `,this.container.querySelector("#btn-new-univ").addEventListener("click",()=>{this.onNewUniverse?.(),this.render()}),this.container.querySelector("#btn-dup-univ").addEventListener("click",()=>{this.saveSystem.duplicateUniverse(this.universe.activeUniverseId)&&this.render()}),this.container.querySelector("#btn-save-snap").addEventListener("click",()=>{const e=this.camera.get();this.universe.saveCurrentSnapshot(new Date().toLocaleTimeString(),{x:e.x,y:e.y,zoom:e.zoom}),this.render()}),this.container.querySelector("#btn-export").addEventListener("click",()=>{try{const e=this.saveSystem.exportUniverseJSON(this.universe.activeUniverseId),t=new Blob([e],{type:"application/json"}),s=document.createElement("a");s.href=URL.createObjectURL(t),s.download="universe.json",s.click()}catch(e){alert("Export failed: "+e)}}),this.container.querySelector("#btn-import").addEventListener("click",()=>{const e=document.createElement("input");e.type="file",e.accept=".json",e.onchange=async()=>{if(!e.files?.length)return;const t=await e.files[0].text();try{this.saveSystem.importUniverseJSON(t),this.render()}catch(s){alert("Import failed: "+s)}},e.click()}),this.render()}render(){const e=this.container.querySelector("#univ-list");if(!e)return;const t=this.saveSystem.listUniverses();e.innerHTML="";for(const s of t){const i=document.createElement("div");i.className="univ-item"+(s.id===this.universe.activeUniverseId?" active":""),i.innerHTML=`
        <div class="univ-name">${s.name}</div>
        <div class="univ-meta">${s.snapshots.length} snapshots · ${new Date(s.modifiedAt).toLocaleDateString()}</div>
        ${s.snapshots.length>0?`
        <details class="snap-list">
          <summary>Snapshots (${s.snapshots.length})</summary>
          ${s.snapshots.slice(-10).reverse().map(n=>`
            <div class="snap-item" data-univ="${s.id}" data-snap="${n.id}">
              <span class="snap-name">${n.name}</span>
              <span class="snap-time">T=${n.simulationTime.toFixed(0)}</span>
              <button class="snap-load-btn" data-univ="${s.id}" data-snap="${n.id}">Load</button>
              <button class="snap-del-btn"  data-univ="${s.id}" data-snap="${n.id}">×</button>
            </div>
          `).join("")}
        </details>`:""}
      `,i.addEventListener("click",n=>{const o=n.target;if(o.classList.contains("snap-load-btn")){const a=o.dataset.univ,r=o.dataset.snap;this.onLoadSnapshot?.(a,r)}else if(o.classList.contains("snap-del-btn")){const a=o.dataset.univ,r=o.dataset.snap;this.saveSystem.deleteSnapshot(a,r),this.render()}else!o.classList.contains("snap-item")&&s.id!==this.universe.activeUniverseId&&this.onSwitchUniverse?.(s.id)}),e.appendChild(i)}}}async function dt(){if(!navigator.gpu){document.getElementById("webgpu-error").style.display="flex";return}const l=document.getElementById("gpu-canvas"),e=document.getElementById("overlay"),t=document.getElementById("left-panel"),s=document.getElementById("right-panel"),i=document.getElementById("top-bar"),n=document.getElementById("bottom-bar"),o=document.getElementById("univ-panel");function a(){const u=window.innerWidth,y=window.innerHeight;l.width=u,l.height=y,e.width=u,e.height=y}a(),window.addEventListener("resize",a);const r=new De;if(!await r.init()){document.getElementById("webgpu-error").style.display="flex";return}const c=new ze(r),p=new et(L),v=new it,d=new nt(l);await p.init(l,e,r.device),await v.init(r.device,navigator.gpu.getPreferredCanvasFormat()),c.generateInitialUniverse(),c.syncGPU(),p.uploadBodyRenderData(c.bodySystem.bodies);const m=new Ze(r,c,p,v,d),g=new ot(t),f=new rt(s),b=new at(n),w=new ct(i),S=new lt(o,c.saveSystem,c,d);let B=null,x=!1,M="planet";g.onSelect=u=>{B=u;const y=c.bodySystem.get(u);f.render(y??null)},g.onDelete=u=>{c.removeBody(u),B===u&&(B=null,f.render(null))},g.onFocus=u=>{d.focusOn(u.position[0],u.position[1])},f.onUpdate=(u,y)=>{c.updateBody(u,y)},f.onThrustToggle=(u,y)=>{c.updateBody(u,{thrustActive:y});const _=c.bodySystem.get(u);f.render(_??null)},f.onAutopilot=u=>{const y=c.bodySystem.get(u);if(!y||y.type!=="rocket")return;const _=c.bodySystem.bodies.filter(E=>E.id!==u&&(E.type==="star"||E.type==="planet")).sort((E,P)=>{const T=Math.hypot(E.position[0]-y.position[0],E.position[1]-y.position[1]),O=Math.hypot(P.position[0]-y.position[0],P.position[1]-y.position[1]);return T-O})[0];_&&(m.rockets.autopilotCircularise(y,_),c.updateBody(u,{thrust:y.thrust,thrustActive:y.thrustActive}),f.render(y))},b.onPause=u=>{m.paused=u},b.onSpeed=u=>{m.setSpeed(u)},b.onStepOnce=()=>{m.stepOnce()},w.onModeChange=u=>{m.setMode(u)},w.onOverlayChange=u=>{Object.assign(m.overlays,u)},w.setAddClickListener(()=>{x=!x,M=w.getAddType(),e.style.cursor=x?"crosshair":"default",e.style.pointerEvents=x?"auto":"none"}),S.onLoadSnapshot=(u,y)=>{c.loadSnapshot(u,y),p.clearTrails(),p.uploadBodyRenderData(c.bodySystem.bodies),S.render()},S.onNewUniverse=()=>{const u=c.saveSystem.createUniverse(`Universe ${Date.now()}`);c.activeUniverseId=u.id,c.generateInitialUniverse(),c.syncGPU(),p.clearTrails(),p.uploadBodyRenderData(c.bodySystem.bodies),S.render()},S.onSwitchUniverse=u=>{const y=c.saveSystem.getUniverse(u);if(!y||y.snapshots.length===0)return;c.activeUniverseId=u;const _=y.snapshots[y.snapshots.length-1];c.loadSnapshot(u,_.id),p.clearTrails(),p.uploadBodyRenderData(c.bodySystem.bodies),S.render()},e.addEventListener("click",u=>{if(!x)return;const[y,_]=d.screenToWorld(u.clientX,u.clientY),E=c.bodySystem.bodies;let P=E[0],T=1/0;for(const q of E){const ee=Math.hypot(q.position[0]-y,q.position[1]-_);ee<T&&(T=ee,P=q)}const O=P?.type==="star"||P?.type==="planet"?P.mass:0,ye=P?.position??[0,0],ge=P?.velocity??[0,0],be=O>0?R([y,_],ye,O,c.params.G,ge):[0,0],we={star:1e3,planet:1,moon:.01,asteroid:1e-4,rocket:.05},Q=c.addBody({type:M,position:[y,_],velocity:be,mass:we[M]??1,fuel:M==="rocket"?Z:void 0,thrustActive:!1});B=Q.id,x=!1,e.style.cursor="default",e.style.pointerEvents="none",f.render(Q)});const A=new Set;window.addEventListener("keydown",u=>{A.add(u.key);const y=B&&c.bodySystem.get(B)?.type==="rocket"?B:c.bodySystem.bodies.find(T=>T.type==="rocket")?.id;if(!y)return;const _=c.bodySystem.get(y);if(!_)return;const P={ArrowUp:[0,1],ArrowDown:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0],w:[0,1],s:[0,-1],a:[-1,0],d:[1,0]}[u.key];if(P&&(m.rocketInput.thrustX=P[0],m.rocketInput.thrustY=P[1],c.updateBody(y,{thrustActive:!0,thrust:P})),u.key===" "){const T=!_.thrustActive;c.updateBody(y,{thrustActive:T})}}),window.addEventListener("keyup",u=>{A.delete(u.key),["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"].includes(u.key)&&(m.rocketInput.thrustX=0,m.rocketInput.thrustY=0)}),m.onStats=u=>{b.updateStats(u)},m.onBodiesChanged=()=>{g.render(c.bodySystem);const u=B?c.bodySystem.get(B):null;f.render(u??null)},g.render(c.bodySystem),f.render(null),setInterval(()=>{const u=d.get();c.saveCurrentSnapshot("auto",{x:u.x,y:u.y,zoom:u.zoom}),S.render()},6e4),setInterval(()=>{if(g.render(c.bodySystem),B){const u=c.bodySystem.get(B);u&&f.render(u)}},250),m.start()}dt().catch(l=>{console.error("OrbitCraft init failed:",l);const e=document.getElementById("webgpu-error");e&&(e.style.display="flex",e.querySelector(".err-msg").textContent=String(l))});
