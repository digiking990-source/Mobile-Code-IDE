"use strict";

window.CodeStudioPythonLessons = Object.freeze([
  {
    id: "variables",
    title: "Variables and print",
    level: "Beginner",
    challenge: "Store your name in a variable and print a greeting.",
    starter: 'name = "Coder"\nprint(f"Hello, {name}!")\n',
    expected: "Hello, Coder!",
    hint: "Change the text in name, then use print() to show it."
  },
  {
    id: "numbers",
    title: "Numbers and arithmetic",
    level: "Beginner",
    challenge: "Calculate 7 times 8, then print the answer.",
    starter: "answer = 7 * 8\nprint(answer)\n",
    expected: "56",
    hint: "Use the * operator for multiplication."
  },
  {
    id: "conditions",
    title: "Make a decision",
    level: "Beginner",
    challenge: "Print 'adult' when age is at least 18, otherwise print 'young'.",
    starter: "age = 20\nif age >= 18:\n    print(\"adult\")\nelse:\n    print(\"young\")\n",
    expected: "adult",
    hint: "Compare age with >= and indent the code inside if and else."
  },
  {
    id: "loops",
    title: "Repeat with a loop",
    level: "Beginner",
    challenge: "Use a loop to print the numbers 1 through 3, one per line.",
    starter: "for number in range(1, 4):\n    print(number)\n",
    expected: "1\n2\n3",
    hint: "range(1, 4) produces 1, 2, and 3."
  },
  {
    id: "functions",
    title: "Write a function",
    level: "Beginner",
    challenge: "Write double(number) and print double(21).",
    starter: "def double(number):\n    return number * 2\n\nprint(double(21))\n",
    expected: "42",
    hint: "Return number * 2 from your function."
  },
  {
    id: "lists",
    title: "Work with a list",
    level: "Beginner",
    challenge: "Find the total of the numbers in the list.",
    starter: "scores = [8, 9, 10]\nprint(sum(scores))\n",
    expected: "27",
    hint: "The built-in sum() adds all numbers in a list."
  }
]);
