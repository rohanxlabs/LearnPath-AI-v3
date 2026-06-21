export const QUIZ_QUESTIONS: Record<string, any[]> = {
  'quiz-python': [
    {
      question: 'Which of the following creates a Python generator expression rather than a list comprehension?',
      options: [
        '[x**2 for x in range(10)]',
        '(x**2 for x in range(10))',
        '{x**2 for x in range(10)}',
        'generator(x**2 for x in range(10))'
      ],
      correctIndex: 1,
      explanation: 'Parentheses ( ) in place of square brackets [ ] create a memory-efficient yield-based generator object in Python.'
    },
    {
      question: 'What is the runtime complexity of looking up a key in a standard Python dictionary in the average case?',
      options: [
        'O(1)',
        'O(log N)',
        'O(N)',
        'O(N log N)'
      ],
      correctIndex: 0,
      explanation: 'Python dictionaries use hash tables, offering an average O(1) constant time lookup complexity.'
    },
    {
      question: 'How do you execute a vector broadcast in NumPy to add a 1D array of shape (3,) to a 2D array of shape (4,3)?',
      options: [
        'You must convert the 1D array with np.reshape(3, 4)',
        'Numerical array shapes must be identical; broadcasting is not possible here',
        'Directly add them: array2d + array1D; NumPy aligns trailing dimensions automatically',
        'Use np.dot(array2d, array1D)'
      ],
      correctIndex: 2,
      explanation: 'When operating on two arrays, NumPy compares their shapes element-wise starting with trailing dimensions. Since (4,3) and (3,) trailing dimensions match (3), broadcasting handles it automatically.'
    }
  ],
  'quiz-math': [
    {
      question: 'What is the dot product of vectors u = [1, 2, 3] and v = [4, -1, 2]?',
      options: [
        '6',
        '8',
        '10',
        '14'
      ],
      correctIndex: 1,
      explanation: 'The dot product is calculate as (1*4) + (2*-1) + (3*2) = 4 - 2 + 6 = 8.'
    },
    {
      question: 'In Deep Learning optimization, why does gradient descent compute the partial derivative of the loss function?',
      options: [
        'To find the global maximum of target activations.',
        'To determine the direction of steepest ascent of error rates.',
        'To point in the direction of steepest descent, guiding parameter updates to reduce total loss.',
        'To establish bounds on memory usage values.'
      ],
      correctIndex: 2,
      explanation: 'The gradient of the loss function represents the direction of steepest increase. Computing negative gradients guides parameters downwards to reduce prediction errors.'
    }
  ],
  'quiz-llm': [
    {
      question: 'What is the core purpose of the Self-Attention mechanism in Transformer architectures?',
      options: [
        'To compile models faster on CUDA hardware blocks.',
        'To dynamically compute context dependencies between all tokens in a sequence regardless of distance.',
        'To isolate single tokens from surrounding context indices.',
        'To restrict vocabulary lookup vectors.'
      ],
      correctIndex: 1,
      explanation: 'Self-Attention computes compatibility coefficients between query, key, and value vectors of all inputs, letting the network correlate distant terms in parallel.'
    }
  ],
  'quiz-rag': [
    {
      question: 'What is the purpose of RAG (Retrieval-Augmented Generation) in LLM business systems?',
      options: [
        'To compile source code into machine instruction binaries.',
        'To inject external custom documents context into the prompt before generation, reducing hallucinations.',
        'To compress weights on Edge CPU devices.',
        'To increase general pretraining parameters weights.'
      ],
      correctIndex: 1,
      explanation: 'RAG fetches high-similarity information chunks from document vector spaces and presents them as contextual background inside the prompt context.'
    }
  ]
};