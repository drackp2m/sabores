const validPairs = {
  '✨': 'feat',
  '🎨': 'style',
  '🧪': 'test',
  '♻️': 'refactor',
  '🐛': 'fix',
  '📚': 'docs',
  '🚀': 'perf',
  '🏗️': 'build',
  '💻': 'ci',
  '🎒': 'chore',
  '⏪': 'revert',
};

const validTypes = Object.values(validPairs);

export default {
  parserPreset: {
    parserOpts: {
      headerPattern: /^(.+?)\s(?<type>\w+): (?<subject>.+)$/u,
      headerCorrespondence: ['emoji', 'type', 'subject'],
    },
  },
  plugins: [
    {
      rules: {
        'header-pattern': ({ header }) => {
          const match = header.match(/^(.+?)\s(?<type>\w+): (?<subject>.+)$/u);

          if (null === match) {
            return [false, 'Commit message must start with an emoji followed by type: message'];
          }

          const emoji = match[1];
          const type = match[2];
          const isValidPair = validPairs[emoji] === type;

          return [
            isValidPair,
            `Invalid emoji-type combination. Emoji ${emoji} must be used with type "${validPairs[emoji]}"`,
          ];
        },
      },
    },
  ],
  rules: {
    'header-pattern': [2, 'always'],
    'type-enum': [2, 'always', validTypes],
    'subject-min-length': [2, 'always', 10],
    'subject-max-length': [2, 'always', 75],
    'header-max-length': [2, 'always', 100],
  },
};
