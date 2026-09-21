import { Component } from 'react';

export default class ConsumerErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed:false, resetKey:props.resetKey };
  }

  static getDerivedStateFromError() { return { failed:true }; }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { failed:false, resetKey:props.resetKey } : null;
  }

  render() {
    if (this.state.failed) return <main className="account-page"><section className="account-state" role="alert">
      <h1>Что-то пошло не так</h1><p>Обновите страницу или вернитесь на главную</p>
      <a className="account-button" href="/">Вернуться на главную</a>
    </section></main>;
    return this.props.children;
  }
}
