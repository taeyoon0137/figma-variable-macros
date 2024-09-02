import * as color2k from "color2k";

/**
 * Resolvers to render each variable value to a string
 *
 * Uses array instead of enum to iterate over each value
 */
const VARIABLE_RESOLVERS = [
  "v", // Variable value
  "hex", // Hexcode (e.g. #FF0000)
  "rgba", // RGBA (e.g. rgba(255, 0, 0, 1))
  "bound", // Bounded variable name
  "r", // Red value
  "g", // Green value
  "b", // Blue value
  "a", // Alpha value
] as const;

/**
 * Prints the variables in the current page
 */
export async function printVariablesFormatted(): Promise<void> {
  const variables = await figma.variables.getLocalVariablesAsync();
  const variableMap = new Map<string, Variable>(
    variables.map((v) => [v.name, v])
  );

  /**
   * Gets a variable by name
   *
   * @param name - The name of the variable
   * @returns Variable
   */
  function getVariable(name: string): Variable {
    const variable = variableMap.get(name);

    if (!variable) {
      throw new Error(`Variable ${name} not found`);
    }

    return variable;
  }

  let printedCount = 0;
  const textNodesToRender = figma.currentPage
    .findAll((node) => node.type === "TEXT" && node.name.startsWith("%printf"))
    .filter((node): node is TextNode => node.type === "TEXT"); // Narrow down to TextNode

  // Iterate over all text nodes
  for (const node of textNodesToRender) {
    const name = node.name;
    const matched = name.match(/%printf\("(.*)", (.*)\)/);

    // Skip if the name does not match the pattern
    if (matched === null) continue;

    // Get the format string and variable name
    const [fstring, varName] = [matched[1], matched[2]].map((s) => s.trim());
    const variable = getVariable(varName);
    const collection = figma.variables.getVariableCollectionById(
      variable.variableCollectionId
    )!;
    const modeId = node.resolvedVariableModes[collection.id];

    // Replace variables in the format string
    const resultString = VARIABLE_RESOLVERS.filter(([key]) =>
      fstring.includes(`%${key}`)
    ) // Filter out unused variables
      .reduce(
        (acc, [key, value]) =>
          acc.replaceAll(`%${key}`, variableResolver(key, value)),
        fstring
      ); // Replace variables

    await figma.loadFontAsync(node.fontName as FontName);
    node.characters = resultString;

    printedCount += 1;

    /**
     * Resolves each variable to required values
     *
     * Uses if statements instead of switch to avoid efficiency
     */
    function variableResolver(
      resolver: string,
      variableValue: VariableValue
    ): string {
      // Return directly
      if (resolver === "v") return variableValue.toString();

      // Utilities
      if (resolver === "bound")
        return getBoundedName(variable, modeId) ?? "N/A";

      // Color Variables
      const RGBA = getRGBA(variableValue);
      const rgba = color2k.rgba(RGBA.r, RGBA.g, RGBA.b, RGBA.a);

      if (resolver === "rgba") return rgba;
      if (resolver === "hex") return color2k.toHex(rgba);
      if (resolver === "r") return RGBA.r.toString();
      if (resolver === "g") return RGBA.g.toString();
      if (resolver === "b") return RGBA.b.toString();
      if (resolver === "a") return RGBA.a.toString();

      // No match
      throw new Error("Variable resolver not found:" + resolver);
    }
  }

  figma.notify(`Printed ${printedCount} variables`);
}

/**
 * Evaluates a variable
 *
 * @param variable - The variable to evaluate
 * @param modeId - The mode ID to evaluate the variable in
 * @returns VariableValue
 */
function evaluateVariable(variable: Variable, modeId: string): VariableValue {
  const value = variable.valuesByMode[modeId];

  if (isVariableAlias(value)) {
    const boundVariable = figma.variables.getVariableById(value.id)!;
    return evaluateVariable(boundVariable, modeId);
  }

  return value;
}

/**
 * Gets the bounded name of a variable
 *
 * @param variable - The variable to get the bounded name of
 * @param modeId - The mode ID to get the bounded name in
 * @returns The bounded name of the variable
 */
function getBoundedName(variable: Variable, modeId: string): string | null {
  const value = variable.valuesByMode[modeId];

  if (isVariableAlias(value)) {
    const boundVariable = figma.variables.getVariableById(value.id)!;
    return boundVariable.name;
  }
  return null;
}

/**
 * Gets the RGBA value from a VariableValue
 *
 * @param variableValue - The VariableValue to get the RGBA value from
 * @returns RGBA
 */
function getRGBA(variableValue: VariableValue): RGBA {
  if (!variableValue || typeof variableValue !== "object") {
    throw new Error("Variable value is not an object");
  }

  if (
    "r" in variableValue &&
    "g" in variableValue &&
    "b" in variableValue &&
    "a" in variableValue
  ) {
    return {
      r: variableValue.r * 255,
      g: variableValue.g * 255,
      b: variableValue.b * 255,
      a: variableValue.a,
    };
  }

  throw new Error("Variable value is not an RGBA object");
}

/**
 * Checks if the value is a VariableAlias
 *
 * @param value - The value to check
 * @returns Whether the value is a VariableAlias
 */
function isVariableAlias(value: unknown): value is VariableAlias {
  // Check if the value is an object with a type property
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  return value.type === "VARIABLE_ALIAS";
}
