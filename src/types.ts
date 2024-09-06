export type JSONObject = {[Key in string]: JSONValue} & {[Key in string]?: JSONValue | undefined};
export type JSONArray = JSONValue[] | readonly JSONValue[];
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;