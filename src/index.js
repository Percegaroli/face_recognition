const faceapi= require('@vladmandic/face-api/dist/face-api.node-cpu.js');
const canvas = require('canvas');
const { readdir, writeFile } = require('fs/promises')
const { v4 } = require('uuid');
const { foldersPath, referenceName, resultBox } = require('./config');

const { Canvas, Image, ImageData } = canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const initializeNeuralModels = async () => {
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(foldersPath.models),
    faceapi.nets.tinyFaceDetector.loadFromDisk(foldersPath.models),
    faceapi.nets.faceLandmark68Net.loadFromDisk(foldersPath.models),
    faceapi.nets.faceRecognitionNet.loadFromDisk(foldersPath.models)
  ]);
}

const loadReferenceImages = async () => {
  const referenceFolderPath = foldersPath.referenceImages;
  const referenceImagesFolder = await readdir(referenceFolderPath);
  return Promise.all(referenceImagesFolder.map(reference => canvas.loadImage(`${referenceFolderPath}/${reference}`)));
}

const loadQueryImage = async () => {
  const queryImageFolderPath = foldersPath.queryImage;
  const queryImagesFolder = await readdir(queryImageFolderPath);
  return canvas.loadImage(`${queryImageFolderPath}/${queryImagesFolder[0]}`);
}

const recognizeFaces = async () => {
  const [ referenceImages, queryImage ] = await Promise.all([loadReferenceImages(), loadQueryImage()]);
  const queryImageDescriptorTask = faceapi.detectAllFaces(queryImage).withFaceLandmarks().withFaceDescriptors();
  const referenceImagesDescriptors = await createReferenceLabeledDescriptors(referenceImages);
  const faceMatcher = new faceapi.FaceMatcher(referenceImagesDescriptors);
  drawResults(faceMatcher, await queryImageDescriptorTask, queryImage);
}

const createReferenceLabeledDescriptors = async (referenceImages) => {
  const referenceImagesDescriptorTasks = await Promise.all(referenceImages.map(reference => faceapi.detectSingleFace(reference)
    .withFaceLandmarks()
    .withFaceDescriptor()));
  return new faceapi.LabeledFaceDescriptors(referenceName, referenceImagesDescriptorTasks.map(descriptor => descriptor.descriptor));
}

const drawResults = (faceMatcher, queryDescriptors, queryImage) => {
  const queryDrawBoxes = queryDescriptors.map(descriptors => {
    const bestMatch = faceMatcher.findBestMatch(descriptors.descriptor);
    return createDrawBox(descriptors, bestMatch);
  })
  const outQuery = faceapi.createCanvasFromMedia(queryImage);
  queryDrawBoxes.forEach(drawBox => drawBox.draw(outQuery));
  saveResultFile(outQuery)
}

const createDrawBox = (descriptors, bestMatch) => {
  const boxColor = bestMatch.label === 'unknown' ? resultBox.unknownPersonColor : resultBox.matchColor;
  return new faceapi.draw.DrawBox(descriptors.detection.box, {
    label: bestMatch.label,
    boxColor
  });
}

const saveResultFile = async (resultFile) => {
  writeFile(`${foldersPath.output}/${v4()}.jpg`, resultFile.toBuffer('image/jpeg'));
}

const main = async () => {
  await initializeNeuralModels();
  recognizeFaces();
}

main();