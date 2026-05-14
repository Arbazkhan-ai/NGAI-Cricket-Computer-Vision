import tensorflow as tf
import tf2onnx
import os

model_path = r'D:\Full Webdevelopment\Web\backend\models\lstm_shot_v2.keras'
output_path = r'D:\Full Webdevelopment\Web\backend\models\lstm_shot_v2.onnx'

print(f"Loading Keras model from {model_path}...")
model = tf.keras.models.load_model(model_path)

print("Converting to ONNX...")
spec = (tf.TensorSpec((None, 30, 132), tf.float32, name="input"),)
model_proto, _ = tf2onnx.convert.from_keras(model, input_signature=spec, opset=13)

print(f"Saving ONNX model to {output_path}...")
with open(output_path, "wb") as f:
    f.write(model_proto.SerializeToString())

print("Conversion complete!")
