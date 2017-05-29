/**********************************************************************
*            Tutorial_Simple_Landcover_Classification
***********************************************************************/

// Add Study area
var posen = ee.FeatureCollection('ft:1HZkgaVQW77uOk5K_lutgrhIQbHTcDS5Ovrweyn3-');
Map.addLayer((ee.Image(0).mask(0).paint(posen, '000000', 3)), {palette: '000000'}, 'Posen study area');
Map.centerObject(posen, 11);

// Load agricultural field polygons from Feature Table; Cropclasses have to be numeric.
var points = ee.FeatureCollection('ft:1JV2hC3-cSROHyZps49iHkZQ8Ecy6B0TeM-gY2l1u')

// Load a Landsat 8 NDVI composite.
var LS8 = ee.ImageCollection('LANDSAT/LC8_L1T_ANNUAL_GREENEST_TOA')
            .toList(3)
            .get(2)  
// Select bands and clip to aoi.
var bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10', 'B11']
LS8 = ee.Image(LS8)
            .select(bands)
            .clip(posen)
print(LS8)

// Overlay the points on the imagery to get training samples.
var training = LS8.sampleRegions(points, ['class'], 30);
// Train/Test split by introducing a column of random values.
var trainTest = training.randomColumn('random', 0); // Column name, seed.
var trainSet = trainTest.filter(ee.Filter.lessThan('random', 0.8));
var testSet = trainTest.filter(ee.Filter.greaterThanOrEquals('random', 0.8));
print(trainTest, trainSet, testSet)

// Train a RandomForest classifier with default parameters.
var classifier = ee.Classifier.randomForest(30).train(trainSet, 'class', bands);
// Classify the image with the same bands used for training.
var classified = LS8.select(bands).classify(classifier);

// Display the input and classification result.
Map.addLayer(LS8.clip(posen), {bands: ['B4', 'B3', 'B2'], max: 0.2}, '2015 toa annual greenest composite');
Map.addLayer(classified.clip(posen), {min: 0, max: 5, palette: ['ff0000', '0000ff', '006400', '00ff00', '00ffff', 'ffff00']}, 'classification');

// Get a confusion matrix based on the (subsampled) training data representing resubstitution accuracy.
//Axis 1 (the rows) of the matrix correspond to the input classes, and Axis 0 (the columns) to the output classes.
var trainAccuracy = classifier.confusionMatrix();
print('-----------Classification/Training-------------');
//print('Classification resubstitution error matrix: ', trainAccuracy);
print('Classification overall accuracy: ', trainAccuracy.accuracy());
//print('Training consumers accuracy: ', trainAccuracy.consumersAccuracy());
//print('Training producers accuracy: ', trainAccuracy.producersAccuracy());
print('Kappa', trainAccuracy.kappa());

// Classify the validation data.
var validated = testSet.classify(classifier);
// Get an error matrix based on the (subsampled) test data representing expected accuracy.
var testAccuracy = validated.errorMatrix('class', 'classification');
print('-----------Validation/Testing-------------');
print('Validation error matrix: ', testAccuracy);
print('Validation overall accuracy: ', testAccuracy.accuracy());
print('Testing consumers accuracy: ', testAccuracy.consumersAccuracy());
print('Testing producers accuracy: ', testAccuracy.producersAccuracy());
print('Kappa', testAccuracy.kappa());


// Export the image, specifying scale and region.
Export.image(classified, 'exportImageExample', {
  scale: 30,
  region: posen,
  crs: 'EPSG:32633'
});