// Example roadmap shown on first visit. Same shape as NeetCode's DSA roadmap,
// filled with classic Codeforces problems. Names and ratings refresh from the API on sync.

const P = (contestId, index, name) => ({ contestId, index, name, rating: 0 });

const TOPICS = [
  ['arrays', 'Arrays & Hashing', 547, 107, [P(4, 'C', 'Registration system'), P(520, 'A', 'Pangram'), P(443, 'A', 'Anton and Letters')]],
  ['stack', 'Stack', 616, 221, [P(5, 'C', 'Longest Regular Bracket Sequence'), P(343, 'B', 'Alternating Current')]],
  ['two', 'Two Pointers', 412, 236, [P(279, 'B', 'Books'), P(6, 'C', 'Alice, Bob and Chocolate')]],
  ['bs', 'Binary Search', 261, 370, [P(706, 'B', 'Interesting drink'), P(474, 'B', 'Worms')]],
  ['window', 'Sliding Window', 456, 370, [P(676, 'C', 'Vasya and String'), P(602, 'B', 'Approximating a Constant Range')]],
  ['list', 'Linked List', 664, 376, [P(1154, 'E', 'Two Teams')]],
  ['trees', 'Trees', 448, 499, [P(115, 'A', 'Party'), P(580, 'C', 'Kefa and Park')]],
  ['tries', 'Tries', 276, 625, [P(706, 'D', "Vasiliy's Multiset")]],
  ['back', 'Backtracking', 619, 620, [P(550, 'B', 'Preparing Olympiad'), P(1097, 'B', 'Petr and a Combination Lock')]],
  ['heap', 'Heap / Priority Queue', 391, 734, [P(1526, 'C1', 'Potions (Easy Version)'), P(1526, 'C2', 'Potions (Hard Version)')]],
  ['graphs', 'Graphs', 610, 761, [P(510, 'B', 'Fox And Two Dots'), P(520, 'B', 'Two Buttons')]],
  ['dp1', '1-D Dynamic Programming', 829, 758, [P(189, 'A', 'Cut Ribbon'), P(455, 'A', 'Boredom')]],
  ['intervals', 'Intervals', 69, 863, [P(1029, 'C', 'Maximal Intersection')]],
  ['greedy', 'Greedy', 282, 913, [P(545, 'C', 'Woodcutters'), P(489, 'C', 'Given Length and Sum of Digits...')]],
  ['adv', 'Advanced Graphs', 469, 889, [P(20, 'C', 'Dijkstra?'), P(25, 'D', 'Roads not only in Berland')]],
  ['dp2', '2-D Dynamic Programming', 694, 925, [P(1195, 'C', 'Basketball Exercise'), P(431, 'C', 'k-Tree')]],
  ['bits', 'Bit Manipulation', 919, 908, [P(579, 'A', 'Raising Bacteria'), P(276, 'D', 'Little Girl and Maximum XOR')]],
  ['math', 'Math & Geometry', 841, 1049, [P(1, 'A', 'Theatre Square'), P(1, 'C', 'Ancient Berland Circus')]],
];

const LINKS = [
  ['arrays', 'two'], ['arrays', 'stack'],
  ['two', 'bs'], ['two', 'window'], ['two', 'list'],
  ['bs', 'trees'], ['list', 'trees'],
  ['trees', 'tries'], ['trees', 'heap'], ['trees', 'back'],
  ['heap', 'intervals'], ['heap', 'greedy'], ['heap', 'adv'],
  ['back', 'graphs'], ['back', 'dp1'],
  ['graphs', 'adv'], ['graphs', 'dp2'],
  ['dp1', 'dp2'], ['dp1', 'bits'],
  ['dp2', 'math'], ['bits', 'math'],
];

export function makeSeedRoadmap() {
  return {
    id: 'seed-dsa',
    title: 'DSA Roadmap (Codeforces edition)',
    description: 'The classic interview topic order, with Codeforces problems at each step.',
    author: 'DevPath',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    topics: TOPICS.map(([id, title, x, y, problems]) => ({ id, title, x, y, problems })),
    links: LINKS.map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
  };
}
