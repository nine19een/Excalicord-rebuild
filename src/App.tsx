import { useState } from 'react';
import './App.css';
import './whiteboard.css';
import RecordingSettingsModal from './components/RecordingSettingsModal';
import WhiteboardPage from './components/WhiteboardPage';

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="app-shell">
      <WhiteboardPage onOpenSettings={() => setSettingsOpen(true)} />

      {settingsOpen && (
        <div className="settings-overlay">
          <button
            type="button"
            className="settings-overlay__backdrop"
            aria-label="关闭设置"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="settings-overlay__content">
            <RecordingSettingsModal onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

