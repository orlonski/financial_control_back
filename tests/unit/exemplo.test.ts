describe('Exemplo - Testes Unitários Simples', () => {
  describe('Operações matemáticas', () => {
    it('should add two numbers correctly', () => {
      const result = 2 + 3
      expect(result).toBe(5)
    })

    it('should multiply two numbers correctly', () => {
      const result = 4 * 5
      expect(result).toBe(20)
    })

    it('should divide two numbers correctly', () => {
      const result = 10 / 2
      expect(result).toBe(5)
    })
  })

  describe('Operações com strings', () => {
    it('should concatenate strings', () => {
      const hello = 'Hello'
      const world = 'World'
      expect(`${hello} ${world}`).toBe('Hello World')
    })

    it('should convert string to uppercase', () => {
      const text = 'exemplo'
      expect(text.toUpperCase()).toBe('EXEMPLO')
    })

    it('should check if string contains substring', () => {
      const text = 'Financial Control'
      expect(text.includes('Control')).toBe(true)
    })
  })

  describe('Operações com arrays', () => {
    it('should find element in array', () => {
      const numbers = [1, 2, 3, 4, 5]
      expect(numbers.includes(3)).toBe(true)
    })

    it('should filter array elements', () => {
      const numbers = [1, 2, 3, 4, 5]
      const evens = numbers.filter(n => n % 2 === 0)
      expect(evens).toEqual([2, 4])
    })

    it('should map array elements', () => {
      const numbers = [1, 2, 3]
      const doubled = numbers.map(n => n * 2)
      expect(doubled).toEqual([2, 4, 6])
    })
  })
})
