import { ClientPlugin, CorePlugin } from '@ulixee/hero-plugin-utils';

export class ClientHelloPlugin extends ClientPlugin {
  static readonly id = 'hello-plugin';

  onHero(hero, sendToCore) {
    hero.hello = async (name) => await sendToCore('hello-plugin', name);
  }
}

export class CoreHelloPlugin extends CorePlugin {
  static readonly id = 'hello-plugin';

  onClientCommand({ page }, name) {
    `Hello ${name}`);
  }
}