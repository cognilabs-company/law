// Architecture placeholder only (spec section 27). The current GLB's single
// mesh has zero morph targets (confirmed by reading the file's own glTF JSON
// — meshes[0].primitives[0].targets is absent) and the face is a painted
// region of the baseColor texture, not a driven element. A future
// expression system has two real options once there's an asset for it:
//  - morph targets added to the mesh (mesh.morphTargetDictionary would then
//    be populated and this component would drive mesh.morphTargetInfluences)
//  - a thin emissive plane/display over the model's face area, expression
//    state applied as a swapped texture/shader uniform
// Nothing renders today; RobotModel does not mount this yet, so it takes no
// props (a future `expression` prop is a one-line addition once there's
// something for it to drive).
export type RobotExpression = "default" | "happy" | "curious" | "thinking" | "surprised" | "blink" | "error" | "success";

export default function RobotFace() {
  return null;
}
