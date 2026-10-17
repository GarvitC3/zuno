/**
 * Local question bank for the DEMO topics only.
 *
 * Every question has one correct answer and a short explanation. These were
 * written and checked by hand (arithmetic re-derived in the explanation).
 * Student-created topics have no bank: Zuno does not generate subject
 * questions it cannot verify — those topics use manual "k correct out of n"
 * results instead.
 */
export interface BankQuestion {
  id: string
  prompt: string
  options: string[]
  /** Index into `options`. */
  answer: number
  explanation: string
}

export const QUESTION_BANK: Record<string, BankQuestion[]> = {
  'math.limits': [
    {
      id: 'lim-1',
      prompt: 'What is lim (x→2) of (x² − 4) / (x − 2)?',
      options: ['0', '2', '4', 'It does not exist'],
      answer: 2,
      explanation: 'Factor the top: (x − 2)(x + 2). Cancel (x − 2) to get x + 2, which tends to 4.',
    },
    {
      id: 'lim-2',
      prompt: 'What is lim (x→0) of sin(x) / x?',
      options: ['0', '∞', 'It does not exist', '1'],
      answer: 3,
      explanation: 'This is a standard limit: sin(x)/x approaches 1 as x approaches 0 (x in radians).',
    },
    {
      id: 'lim-3',
      prompt: 'What is lim (x→∞) of (3x² + 1) / (x² − 5)?',
      options: ['3', '0', '1', '∞'],
      answer: 0,
      explanation: 'Powers match, so divide top and bottom by x². The limit is the ratio of leading coefficients, 3/1 = 3.',
    },
    {
      id: 'lim-4',
      prompt: 'Which set of conditions makes f continuous at x = a?',
      options: [
        'Only that f(a) is defined',
        'Only that the limit as x → a exists',
        'f(a) is defined, the limit exists, and the limit equals f(a)',
        'f(a) equals zero',
      ],
      answer: 2,
      explanation: 'Continuity needs all three: f(a) exists, the limit exists, and they are equal.',
    },
    {
      id: 'lim-5',
      prompt: 'What is lim (x→3⁺) of 1 / (x − 3)?',
      options: ['−∞', '0', '3', '+∞'],
      answer: 3,
      explanation: 'For x slightly greater than 3, x − 3 is a tiny positive number, so 1/(x − 3) grows without bound: +∞.',
    },
  ],
  'math.derivatives': [
    {
      id: 'der-1',
      prompt: 'What is d/dx of x³?',
      options: ['x²', '3x²', '3x', 'x³ / 3'],
      answer: 1,
      explanation: 'Power rule: bring the exponent down and reduce it by one, so 3x².',
    },
    {
      id: 'der-2',
      prompt: 'What is d/dx of sin(x)?',
      options: ['−cos(x)', 'cos(x)', '−sin(x)', 'tan(x)'],
      answer: 1,
      explanation: 'The derivative of sin(x) is cos(x). (The derivative of cos(x) is −sin(x).)',
    },
    {
      id: 'der-3',
      prompt: 'If f(x) = 5x² − 3x + 7, what is f′(2)?',
      options: ['20', '14', '17', '7'],
      answer: 2,
      explanation: 'f′(x) = 10x − 3. At x = 2 that is 20 − 3 = 17.',
    },
    {
      id: 'der-4',
      prompt: 'What is d/dx of x·eˣ?',
      options: ['eˣ', 'x·eˣ', '(x − 1)eˣ', '(x + 1)eˣ'],
      answer: 3,
      explanation: 'Product rule: (x)′·eˣ + x·(eˣ)′ = eˣ + x·eˣ = (x + 1)eˣ.',
    },
    {
      id: 'der-5',
      prompt: 'What is d/dx of (2x + 1)⁵?',
      options: ['10(2x + 1)⁴', '5(2x + 1)⁴', '(2x + 1)⁴', '10(2x + 1)⁵'],
      answer: 0,
      explanation: 'Chain rule: 5(2x + 1)⁴ times the derivative of the inside (2), giving 10(2x + 1)⁴.',
    },
    {
      id: 'der-6',
      prompt: 'If f′(c) = 0 and f″(c) < 0, what does f have at x = c?',
      options: ['A local minimum', 'An inflection point only', 'A local maximum', 'No conclusion is possible'],
      answer: 2,
      explanation: 'A zero slope with the curve bending downward (f″ < 0) is the top of a hill: a local maximum.',
    },
  ],
  'math.integration': [
    {
      id: 'int-1',
      prompt: 'What is ∫ 2x dx?',
      options: ['2x² + C', 'x + C', 'x² + C', '2 + C'],
      answer: 2,
      explanation: 'Reverse the power rule: the antiderivative of 2x is x², plus a constant C.',
    },
    {
      id: 'int-2',
      prompt: 'What is the value of ∫ from 0 to 2 of 3x² dx?',
      options: ['6', '12', '24', '8'],
      answer: 3,
      explanation: 'The antiderivative is x³. Evaluate: 2³ − 0³ = 8.',
    },
    {
      id: 'int-3',
      prompt: 'What is ∫ cos(x) dx?',
      options: ['−sin(x) + C', 'sin(x) + C', 'cos(x) + C', '−cos(x) + C'],
      answer: 1,
      explanation: 'The derivative of sin(x) is cos(x), so the antiderivative of cos(x) is sin(x) + C.',
    },
    {
      id: 'int-4',
      prompt: 'What is ∫ eˣ dx?',
      options: ['x·eˣ + C', 'eˣ/x + C', 'ln(x) + C', 'eˣ + C'],
      answer: 3,
      explanation: 'eˣ is its own derivative, so it is also its own antiderivative (plus C).',
    },
    {
      id: 'int-5',
      prompt: 'What does the Fundamental Theorem of Calculus tell us?',
      options: [
        'Every continuous function is differentiable',
        'Differentiation and integration are inverse operations',
        'The area under any curve is zero',
        'Every integral equals its derivative',
      ],
      answer: 1,
      explanation: 'It links the two: integrating a rate of change recovers the total change, and differentiating an integral recovers the function.',
    },
  ],
  'phys.kinematics': [
    {
      id: 'kin-1',
      prompt: 'A car starts from rest and accelerates uniformly at 3 m/s² for 4 s. What is its final speed?',
      options: ['7 m/s', '24 m/s', '12 m/s', '0.75 m/s'],
      answer: 2,
      explanation: 'v = u + at = 0 + 3 × 4 = 12 m/s.',
    },
    {
      id: 'kin-2',
      prompt: 'Using the same car (rest, 3 m/s², 4 s), how far does it travel in those 4 s?',
      options: ['12 m', '24 m', '36 m', '48 m'],
      answer: 1,
      explanation: 's = ut + ½at² = 0 + ½ × 3 × 16 = 24 m.',
    },
    {
      id: 'kin-3',
      prompt: 'Which of these quantities is a vector?',
      options: ['Distance', 'Speed', 'Time', 'Displacement'],
      answer: 3,
      explanation: 'Displacement has both a size and a direction. Distance, speed and time have size only.',
    },
    {
      id: 'kin-4',
      prompt: 'A ball is thrown straight up. At the very top of its path (ignoring air), what are its velocity and acceleration?',
      options: [
        'Velocity 0, acceleration 0',
        'Velocity 0, acceleration 9.8 m/s² downward',
        'Velocity 9.8 m/s up, acceleration 0',
        'Velocity and acceleration both 9.8 m/s² downward',
      ],
      answer: 1,
      explanation: 'It pauses for an instant, but gravity still pulls it with 9.8 m/s² downward the whole time.',
    },
    {
      id: 'kin-5',
      prompt: 'What does the gradient (slope) of a velocity–time graph represent?',
      options: ['Displacement', 'Distance', 'Acceleration', 'Mass'],
      answer: 2,
      explanation: 'Acceleration is the rate of change of velocity, which is the slope of the v–t graph.',
    },
  ],
  'phys.newton': [
    {
      id: 'new-1',
      prompt: 'A 2 kg object experiences a net force of 10 N. What is its acceleration?',
      options: ['0.2 m/s²', '5 m/s²', '12 m/s²', '20 m/s²'],
      answer: 1,
      explanation: "Newton's second law: a = F / m = 10 / 2 = 5 m/s².",
    },
    {
      id: 'new-2',
      prompt: 'A hockey puck slides at constant velocity across frictionless ice. What is the net force on it?',
      options: ['Equal to its weight', 'In the direction of motion', 'Zero', 'It depends on its speed'],
      answer: 2,
      explanation: "Newton's first law: constant velocity means zero net force. No force is needed to keep it moving.",
    },
    {
      id: 'new-3',
      prompt: "A book rests on a table. Which force is the third-law partner of the Earth's pull on the book (its weight)?",
      options: [
        "The table's upward (normal) force on the book",
        "The book's gravitational pull on the Earth",
        "The book's push on the table",
        'Friction between book and table',
      ],
      answer: 1,
      explanation: 'Third-law pairs act on different objects and are the same type of force. Earth pulls the book, so the book pulls the Earth. The normal force is a different force that happens to balance weight.',
    },
    {
      id: 'new-4',
      prompt: 'What is the weight of a 60 kg person? (g = 9.8 m/s²)',
      options: ['6.1 N', '60 N', '588 N', '5 880 N'],
      answer: 2,
      explanation: 'W = mg = 60 × 9.8 = 588 N.',
    },
    {
      id: 'new-5',
      prompt: 'A net force of 12 N acts on a 3 kg mass at rest for 2 s. What is its final speed?',
      options: ['8 m/s', '6 m/s', '12 m/s', '24 m/s'],
      answer: 0,
      explanation: 'a = F/m = 4 m/s². Then v = at = 4 × 2 = 8 m/s.',
    },
    {
      id: 'new-6',
      prompt: 'Forces of 6 N east and 8 N north act on an object. What is the size of the resultant force?',
      options: ['2 N', '14 N', '48 N', '10 N'],
      answer: 3,
      explanation: 'The forces are at right angles, so √(6² + 8²) = √100 = 10 N.',
    },
  ],
  'phys.energy': [
    {
      id: 'en-1',
      prompt: 'How much work is done lifting a 2 kg box 3 m at constant speed? (g = 9.8 m/s²)',
      options: ['6 J', '19.6 J', '58.8 J', '5.9 J'],
      answer: 2,
      explanation: 'The lifting force equals the weight, mg = 2 × 9.8 = 19.6 N. Work = force × distance = 19.6 × 3 = 58.8 J.',
    },
    {
      id: 'en-2',
      prompt: 'What is the kinetic energy of a 4 kg object moving at 3 m/s?',
      options: ['18 J', '6 J', '12 J', '36 J'],
      answer: 0,
      explanation: 'KE = ½mv² = ½ × 4 × 9 = 18 J.',
    },
    {
      id: 'en-3',
      prompt: 'Which unit measures power?',
      options: ['Joule', 'Newton', 'Pascal', 'Watt'],
      answer: 3,
      explanation: 'Power is energy per time. One watt is one joule per second.',
    },
    {
      id: 'en-4',
      prompt: 'A ball falls from rest with no air resistance. What happens to its total mechanical energy (kinetic + potential)?',
      options: ['It increases', 'It stays constant', 'It decreases', 'It becomes zero at the bottom'],
      answer: 1,
      explanation: 'Potential energy converts into kinetic energy, but the total stays the same when only gravity does work.',
    },
    {
      id: 'en-5',
      prompt: 'A person carries a bag horizontally at constant speed. How much work does the upward force holding the bag do?',
      options: ['Positive work', 'Negative work', 'Zero work', 'Work equal to the bag’s weight'],
      answer: 2,
      explanation: 'Work needs a force component along the displacement. The holding force is vertical, the motion is horizontal, so W = 0.',
    },
  ],
  'chem.atomic': [
    {
      id: 'at-1',
      prompt: 'What determines which element an atom is?',
      options: ['Its number of neutrons', 'Its number of protons', 'Its number of electrons', 'Its mass number'],
      answer: 1,
      explanation: 'The proton count (atomic number) defines the element. Neutron and electron counts can vary.',
    },
    {
      id: 'at-2',
      prompt: 'How many neutrons are in an atom of carbon-14? (carbon has atomic number 6)',
      options: ['6', '14', '20', '8'],
      answer: 3,
      explanation: 'Neutrons = mass number − atomic number = 14 − 6 = 8.',
    },
    {
      id: 'at-3',
      prompt: 'How many valence electrons does a sodium atom (atomic number 11) have?',
      options: ['1', '2', '8', '11'],
      answer: 0,
      explanation: 'Sodium’s electron configuration is 2, 8, 1. The outer shell holds 1 electron.',
    },
    {
      id: 'at-4',
      prompt: 'What are isotopes?',
      options: [
        'Atoms of the same element with different numbers of neutrons',
        'Atoms of different elements with the same mass',
        'Atoms of the same element with different numbers of protons',
        'Ions with the same charge',
      ],
      answer: 0,
      explanation: 'Isotopes share a proton number (same element) but differ in neutrons, so their mass differs.',
    },
    {
      id: 'at-5',
      prompt: 'Which subatomic particle has almost no mass and a negative charge?',
      options: ['Proton', 'Neutron', 'Nucleus', 'Electron'],
      answer: 3,
      explanation: 'Electrons carry a −1 charge and are about 1/1836 the mass of a proton.',
    },
  ],
  'chem.bonding': [
    {
      id: 'bo-1',
      prompt: 'What type of bond holds sodium chloride (NaCl) together?',
      options: ['Covalent', 'Ionic', 'Metallic', 'Hydrogen'],
      answer: 1,
      explanation: 'Sodium transfers an electron to chlorine, forming Na⁺ and Cl⁻ ions held by electrostatic attraction: an ionic bond.',
    },
    {
      id: 'bo-2',
      prompt: 'What is a covalent bond?',
      options: [
        'The transfer of electrons from a metal to a non-metal',
        'The attraction between delocalised electrons and metal ions',
        'The sharing of a pair of electrons between atoms',
        'The attraction between two molecules',
      ],
      answer: 2,
      explanation: 'Covalent bonds form when atoms share electron pairs, typically between non-metals.',
    },
    {
      id: 'bo-3',
      prompt: 'Which molecule contains a double bond?',
      options: ['H₂', 'O₂', 'N₂', 'HCl'],
      answer: 1,
      explanation: 'O₂ is O=O. H₂ and HCl have single bonds; N₂ has a triple bond.',
    },
    {
      id: 'bo-4',
      prompt: 'Why is a water molecule polar?',
      options: [
        'It is linear and symmetrical',
        'Hydrogen is more electronegative than oxygen',
        'It contains ionic bonds',
        'It is bent and oxygen is more electronegative than hydrogen',
      ],
      answer: 3,
      explanation: 'Oxygen pulls the shared electrons harder, and the bent shape stops the bond dipoles cancelling.',
    },
    {
      id: 'bo-5',
      prompt: 'Why can metals conduct electricity?',
      options: [
        'They contain free-moving delocalised electrons',
        'They contain free-moving ions in the solid',
        'Their atoms share electrons in fixed pairs',
        'They have no electrons in the outer shell',
      ],
      answer: 0,
      explanation: 'Metallic bonding is a lattice of positive ions in a sea of delocalised electrons that can carry charge.',
    },
    {
      id: 'bo-6',
      prompt: 'What is the shape of a carbon dioxide (CO₂) molecule?',
      options: ['Bent', 'Trigonal planar', 'Linear', 'Tetrahedral'],
      answer: 2,
      explanation: 'Carbon has two double bonds and no lone pairs. The two regions of electron density sit 180° apart: linear.',
    },
  ],
  'chem.stoich': [
    {
      id: 'st-1',
      prompt: 'What is the molar mass of water, H₂O? (H = 1, O = 16)',
      options: ['10 g/mol', '17 g/mol', '18 g/mol', '34 g/mol'],
      answer: 2,
      explanation: '2 × 1 + 16 = 18 g/mol.',
    },
    {
      id: 'st-2',
      prompt: 'How many moles are in 36 g of water? (molar mass 18 g/mol)',
      options: ['0.5 mol', '2 mol', '18 mol', '36 mol'],
      answer: 1,
      explanation: 'n = mass / molar mass = 36 / 18 = 2 mol.',
    },
    {
      id: 'st-3',
      prompt: 'In 2H₂ + O₂ → 2H₂O, how many moles of water form from 3 mol of H₂ with plenty of O₂?',
      options: ['1.5 mol', '6 mol', '2 mol', '3 mol'],
      answer: 3,
      explanation: 'The mole ratio H₂ : H₂O is 2 : 2, which is 1 : 1. So 3 mol H₂ gives 3 mol H₂O.',
    },
    {
      id: 'st-4',
      prompt: 'Which equation is correctly balanced?',
      options: ['N₂ + 3H₂ → 2NH₃', 'N₂ + H₂ → NH₃', 'N₂ + 2H₂ → 2NH₃', '2N₂ + 3H₂ → 2NH₃'],
      answer: 0,
      explanation: 'N₂ + 3H₂ → 2NH₃ has 2 N and 6 H on both sides. The others do not balance.',
    },
    {
      id: 'st-5',
      prompt: 'What is a limiting reagent?',
      options: [
        'The reactant present in the greatest amount',
        'The reactant that is used up first and limits the product formed',
        'A catalyst that slows the reaction',
        'The product with the lowest mass',
      ],
      answer: 1,
      explanation: 'Once the limiting reagent is gone the reaction stops, so it sets the maximum amount of product.',
    },
  ],
}

export function hasQuestionBank(bankKey: string | undefined): boolean {
  return !!bankKey && (QUESTION_BANK[bankKey]?.length ?? 0) > 0
}

/**
 * Pick up to `count` questions. Rotates through the bank by how many bank
 * checks the student has already taken on this topic, so repeat checks vary.
 */
export function pickQuestions(bankKey: string, previousChecks: number, count = 5): BankQuestion[] {
  const bank = QUESTION_BANK[bankKey] ?? []
  if (bank.length === 0) return []
  const n = Math.min(count, bank.length)
  const start = (previousChecks * n) % bank.length
  return Array.from({ length: n }, (_, i) => bank[(start + i) % bank.length])
}
