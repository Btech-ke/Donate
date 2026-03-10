const use = require('@tensorflow-models/universal-sentence-encoder');
const tf = require('@tensorflow/tfjs-node');

let model;

const knowledge = [
{
q: "how to apply kuccps",
a: "Apply through students.kuccps.net using your KCSE index number and KNEC certificate number. The portal opens May–June."
},
{
q: "kmtc nursing requirements",
a: "KMTC Diploma Nursing requires C plain. Subjects: Biology C, English/Kiswahili C, Chemistry or Physics C−."
},
{
q: "courses for c minus",
a: "With C− you can take KMTC certificates, TVET diplomas, ICT diploma, Business diploma or Tourism diploma."
},
{
q: "helb loan application",
a: "Apply for HELB loan at helb.co.ke after admission to university or TVET."
}
];

async function loadModel(){
if(!model){
model = await use.load();
}
}

async function ask(question){

await loadModel();

const sentences = knowledge.map(k=>k.q);

const embedQuestions = await model.embed(sentences);
const embedUser = await model.embed([question]);

const scores = tf.matMul(embedUser, embedQuestions, false, true);
const values = await scores.data();

let best = 0;
let index = 0;

values.forEach((v,i)=>{
if(v>best){
best = v;
index = i;
}
});

return knowledge[index].a;

}

module.exports = { ask };