# Maia-3

`maia3_simplified.onnx` in this directory is a Maia-3 model checkpoint, produced by
the [Computational Social Science Lab](https://csslab.cs.toronto.edu/) at the
University of Toronto. It is served here unmodified.

- **Weights:** <https://huggingface.co/UofTCSSLab/Maia3-79M> and
  [Maia3-23M](https://huggingface.co/UofTCSSLab/Maia3-23M)
- **Inference code:** <https://github.com/CSSLab/maia3>
- **This ONNX export:** <https://github.com/CSSLab/maia-platform-frontend> (`public/maia3`)
- **License: AGPL-3.0.** The full text is at <https://www.gnu.org/licenses/agpl-3.0.txt>.
  The corresponding source for this application is at
  <https://github.com/chuckdprice/ChessPique-app>, which is public. It has to stay
  that way for as long as the app is deployed — this line named a repository nobody
  could open once already, under the app's pre-rename name.

Maia-3 is a human move-prediction model, not an evaluation engine: it answers "what
would a player of this rating play here", and the app pairs it with Stockfish, which
answers "what is best". The model is a policy network run as a single forward pass —
there is no search behind it, and adding one would make it a worse predictor of human
play.

## Citation

> Daniel Monroe, George Eilender, Philip Chalmers, Zhenwei Tang, and Ashton Anderson.
> "Chessformer: A Unified Architecture for Chess Modeling."
> *The Fourteenth International Conference on Learning Representations* (ICLR), 2026.
> <https://openreview.net/forum?id=2ltBRzEHyd>

```bibtex
@inproceedings{monroe2026chessformer,
  title={Chessformer: A Unified Architecture for Chess Modeling},
  author={Daniel Monroe and George Eilender and Philip Chalmers and Zhenwei Tang
          and Ashton Anderson},
  booktitle={The Fourteenth International Conference on Learning Representations},
  year={2026},
  url={https://openreview.net/forum?id=2ltBRzEHyd}
}
```
