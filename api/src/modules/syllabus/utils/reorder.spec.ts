import { moveItem } from './reorder';

describe('moveItem', () => {
  const ids = ['10', '20', '30'];

  it('sube e intercambia con el anterior', () => {
    expect(moveItem(ids, '20', 'subir')).toEqual({ order: ['20', '10', '30'], changed: true });
    expect(moveItem(ids, '30', 'subir')).toEqual({ order: ['10', '30', '20'], changed: true });
  });

  it('baja e intercambia con el siguiente', () => {
    expect(moveItem(ids, '10', 'bajar')).toEqual({ order: ['20', '10', '30'], changed: true });
  });

  it('subir el primero o bajar el último no cambia nada', () => {
    expect(moveItem(ids, '10', 'subir')).toEqual({ order: ids, changed: false });
    expect(moveItem(ids, '30', 'bajar')).toEqual({ order: ids, changed: false });
    expect(moveItem(['5'], '5', 'bajar')).toEqual({ order: ['5'], changed: false });
  });

  it('un id que no está da null y la lista original no se modifica', () => {
    expect(moveItem(ids, '99', 'subir')).toBeNull();
    moveItem(ids, '20', 'subir');
    expect(ids).toEqual(['10', '20', '30']);
  });
});
