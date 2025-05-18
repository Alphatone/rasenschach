declare module "javascript-lp-solver" {
    export interface Variable {
        [key: string]: number | string | boolean;
    }

    export interface Model {
        optimize: string;
        opType: "max" | "min";
        constraints: {
            [key: string]: {
                equal?: number;
                min?: number;
                max?: number;
            };
        };
        variables: {
            [variableName: string]: Variable;
        };
        ints?: {
            [variableName: string]: 1;
        };
    }

    export interface Solution {
        feasible: boolean;
        result: number;
        [key: string]: any;
    }

    export const Solve: (model: Model) => Solution;
}
