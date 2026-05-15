type VercelFunctionConfig = {
	maxDuration?: number;
};

type VercelConfig = {
	functions?: Record<string, VercelFunctionConfig>;
};

export const config: VercelConfig = {
	functions: {
		'api/**/*.go': {
			maxDuration: 10,
		},
	},
};