'use strict';
const assert=require('assert/strict');
const {setup}=require('./reconciliation_regressions');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
const receipt=(extra={})=>({ticket:'CTA-QA',receipt:'REC-QA',items:[{name:'QA <drink>',qty:1,price:40}],total:40,customer:'QA <script>alert(1)</script>',date:'2026-11-05',method:'Efectivo',paid:true,verified:true,paymentStatus:'CONFIRMADA',received:100,tip:0,change:60,...extra});
function app(){const t=setup();t.load('escapeHtml');t.load('receiptDocument_');t.load('downloadReceipt_');return t;}
test('downloadable document preserves actual receipt/account/items and escapes external text',()=>{
 const t=app(),html=t.ctx.receiptDocument_(receipt());
 for(const value of ['REC-QA','CTA-QA','COBRO CONFIRMADO','QA &lt;drink&gt;','&lt;script&gt;','Cambio: $60'])assert(html.includes(value),value);
 assert(!html.includes('<script'));assert(!html.includes('https:'));
});
test('pending transfer/open credit/free courtesy never claim a collected payment',()=>{
 const t=app();
 for(const [data,state] of [[receipt({paid:false,verified:false,method:'Transferencia',paymentStatus:'PENDIENTE_VERIFICACION'}),'TRANSFERENCIA PENDIENTE'],[receipt({paid:false,verified:false,receipt:'',method:'',paymentStatus:'CUENTA_ABIERTA'}),'CUENTA ABIERTA'],[receipt({paid:false,verified:false,receipt:'',total:0,method:'Cortesía',paymentStatus:'CORTESIA_AUTORIZADA'}),'CORTESÍA AUTORIZADA']]){
  const html=t.ctx.receiptDocument_(data);assert(html.includes(state));assert(!html.includes('COBRO CONFIRMADO'));
 }
});
test('download only creates a local file and does not charge, erase receipt or claim delivery',()=>{
 const t=app(),data=receipt({receipt:'REC/QA:?'});t.ctx.STATE.lastReceiptData=data;let clicked=0,revoked=0,blob;
 t.ctx.callBackend=()=>{throw Error('Must not send');};t.ctx.Blob=class{constructor(parts){blob=parts.join('');}};
 t.ctx.URL={createObjectURL:()=> 'blob:fixture',revokeObjectURL:()=>revoked++};t.ctx.setTimeout=fn=>fn();
 const link={click(){clicked++;},remove(){}};t.ctx.document={createElement:()=>link,body:{appendChild(){}}};
 t.ctx.downloadReceipt_();assert.equal(clicked,1);assert.equal(revoked,1);assert.equal(link.download,'DOMUS-REC_QA__.html');
 assert(blob.includes('REC/QA:?'));assert.equal(t.ctx.STATE.lastReceiptData,data);assert(t.notices[0][0].includes('Entrega el archivo'));
});
test('download failure retains confirmed receipt and tells operator not to repeat collection',()=>{
 const t=app(),data=receipt();t.ctx.STATE.lastReceiptData=data;
 t.ctx.URL={createObjectURL(){throw Error('Unavailable');}};t.ctx.Blob=class{};
 t.ctx.downloadReceipt_();assert.equal(t.ctx.STATE.lastReceiptData,data);assert(t.notices[0][0].includes('no repitas el cobro'));
});
console.log(JSON.stringify({suite:'receipt-delivery-local',passed,customerDelivery:false,hardware:false}));
